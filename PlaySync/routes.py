"""
routes.py  —  PlaySync backend
"""

import requests as req
from flask import render_template, redirect, request, url_for, jsonify, Response, stream_with_context
from flask_login import login_user, login_required, logout_user, current_user
from authlib.integrations.flask_client import OAuth
from datetime import datetime

from models import db, User, Song, UserSongHistory, Follow, Group, GroupMember, Friend


def _upsert_song(track: dict):
    spotify_id = track.get("id")
    if not spotify_id:
        return None
    song = Song.query.filter_by(spotify_id=spotify_id).first()
    if not song:
        song = Song(
            spotify_id=spotify_id,
            title=track.get("name", "Unknown"),
            artist=(track.get("artists") or [{}])[0].get("name", "Unknown"),
            album=track.get("album", {}).get("name"),
            image_url=(track.get("album", {}).get("images") or [{}])[0].get("url"),
            preview_url=track.get("preview_url"),
            duration_ms=track.get("duration_ms"),
        )
        db.session.add(song)
        db.session.flush()
    return song


def _upsert_history(user_id: int, song: Song, source: str):
    entry = UserSongHistory.query.filter_by(user_id=user_id, song_id=song.id).first()
    if entry:
        entry.play_count += 1
        entry.last_played = datetime.utcnow()
        entry.source = source
    else:
        entry = UserSongHistory(user_id=user_id, song_id=song.id, play_count=1, source=source)
        db.session.add(entry)


def sync_spotify_history(user: User, spotify_client):
    if not user.spotify_token:
        return
    token_dict = {"access_token": user.spotify_token, "token_type": "Bearer"}
    endpoints = [
        ("me/player/recently-played?limit=50", "recent"),
        ("me/top/tracks?limit=50&time_range=short_term", "top_short"),
        ("me/top/tracks?limit=50&time_range=medium_term", "top_medium"),
    ]
    for endpoint, source in endpoints:
        try:
            resp = spotify_client.get(endpoint, token=token_dict)
            if resp.status_code != 200:
                continue
            for item in resp.json().get("items", []):
                track = item.get("track", item)
                song = _upsert_song(track)
                if song:
                    _upsert_history(user.id, song, source)
        except Exception:
            continue
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()


def compute_mutual_songs(group_id: int, min_members: int = 2):
    from collections import defaultdict
    members = GroupMember.query.filter_by(group_id=group_id).all()
    member_ids = [m.user_id for m in members]
    if not member_ids:
        return []
    song_member_sets = defaultdict(set)
    song_objects = {}
    for uid in member_ids:
        histories = (
            db.session.query(UserSongHistory, Song)
            .join(Song, UserSongHistory.song_id == Song.id)
            .filter(UserSongHistory.user_id == uid)
            .all()
        )
        for hist, song in histories:
            song_member_sets[song.spotify_id].add(uid)
            song_objects[song.spotify_id] = song
    threshold = min_members if len(member_ids) >= min_members else 1
    mutual = []
    for spotify_id, member_set in song_member_sets.items():
        if len(member_set) >= threshold:
            song = song_objects[spotify_id]
            mutual.append({
                "song_id": song.spotify_id,
                "title": song.title,
                "artist": song.artist,
                "image": song.image_url,
                "preview_url": song.preview_url,
                "shared_by": len(member_set),
                "total_members": len(member_ids),
            })
    mutual.sort(key=lambda x: (-x["shared_by"], x["title"]))
    return mutual


def init_routes(app):
    oauth = OAuth(app)

    spotify = oauth.register(
        name="spotify",
        client_id=app.config["SPOTIFY_CLIENT_ID"],
        client_secret=app.config["SPOTIFY_CLIENT_SECRET"],
        access_token_url="https://accounts.spotify.com/api/token",
        authorize_url="https://accounts.spotify.com/authorize",
        api_base_url="https://api.spotify.com/v1/",
        client_kwargs={
            "scope": (
                "user-read-private user-read-email playlist-read-private "
                "playlist-read-collaborative user-read-playback-state "
                "user-modify-playback-state user-read-currently-playing "
                "user-top-read user-read-recently-played streaming"
            )
        },
    )

    google = oauth.register(
        name="google",
        client_id=app.config["GOOGLE_CLIENT_ID"],
        client_secret=app.config["GOOGLE_CLIENT_SECRET"],
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

    @app.route("/")
    def login_page():
        return render_template("login.html")

    @app.route("/login/spotify")
    def login_spotify():
        return spotify.authorize_redirect(redirect_uri=app.config["SPOTIFY_REDIRECT_URI"])

    @app.route("/callback/spotify")
    def callback_spotify():
        token = spotify.authorize_access_token()
        resp = spotify.get("me", token={"access_token": token["access_token"], "token_type": "Bearer"})
        if resp.status_code != 200:
            return f"Spotify API error: {resp.status_code} - {resp.text}", 400
        profile = resp.json()
        email = profile.get("email")
        if not email:
            return "Spotify account has no email.", 400
        user = User.query.filter_by(email=email).first()
        if not user:
            base_name = profile.get("display_name") or email.split("@")[0]
            username = base_name
            counter = 1
            while User.query.filter_by(username=username).first():
                username = f"{base_name}{counter}"
                counter += 1
            user = User(username=username, email=email, auth_provider="spotify", provider_id=profile["id"])
            db.session.add(user)
        user.spotify_token = token["access_token"]
        user.spotify_refresh_token = token.get("refresh_token")
        db.session.commit()
        login_user(user)
        sync_spotify_history(user, spotify)
        return redirect("/home")

    @app.route("/login/google")
    def login_google():
        return google.authorize_redirect(url_for("callback_google", _external=True))

    @app.route("/callback/google")
    def callback_google():
        token = google.authorize_access_token()
        userinfo = token.get("userinfo") or {}
        if not userinfo:
            return "Failed to fetch user info from Google", 400
        email = userinfo.get("email")
        user = User.query.filter_by(email=email).first()
        if not user:
            base_name = userinfo.get("name") or email.split("@")[0]
            username = base_name
            counter = 1
            while User.query.filter_by(username=username).first():
                username = f"{base_name}{counter}"
                counter += 1
            user = User(username=username, email=email, auth_provider="google", provider_id=userinfo.get("sub"))
            db.session.add(user)
            db.session.commit()
        login_user(user)
        return redirect("/home")

    @app.route("/logout")
    @login_required
    def logout():
        logout_user()
        return redirect("/")

    @app.route("/home")
    @login_required
    def home():
        sync_spotify_history(current_user, spotify)
        return render_template("home.html", user=current_user)

    @app.route("/group")
    @login_required
    def group():
        return render_template("group.html")

    @app.route("/group/<int:group_id>")
    @login_required
    def group_page(group_id):
        g = Group.query.get(group_id)
        if not g:
            return jsonify({"error": "Group not found"}), 404
        if not GroupMember.query.filter_by(group_id=group_id, user_id=current_user.id).first():
            return jsonify({"error": "Not a member"}), 403
        return render_template("group.html", group_id=group_id)

    @app.route("/game")
    @login_required
    def game():
        return render_template("game.html")

    @app.route("/profile")
    @login_required
    def profile():
        return render_template("profile.html", user=current_user)

    @app.route("/api/spotify-token")
    @login_required
    def get_spotify_token():
        return jsonify({"token": current_user.spotify_token})

    @app.route("/api/recently-played")
    @login_required
    def recently_played():
        sync_spotify_history(current_user, spotify)
        rows = (
            db.session.query(UserSongHistory, Song)
            .join(Song, UserSongHistory.song_id == Song.id)
            .filter(UserSongHistory.user_id == current_user.id)
            .filter(UserSongHistory.source == "recent")
            .order_by(UserSongHistory.last_played.desc())
            .limit(20)
            .all()
        )
        return jsonify([{
            "song_id": song.spotify_id,
            "title": song.title,
            "artist": song.artist,
            "image": song.image_url,
            "preview_url": song.preview_url,
        } for hist, song in rows])

    @app.route("/api/top-artists")
    @login_required
    def top_artists():
        if not current_user.spotify_token:
            return jsonify([]), 200
        try:
            resp = spotify.get("me/top/artists?limit=6", token={"access_token": current_user.spotify_token, "token_type": "Bearer"})
            if resp.status_code != 200:
                return jsonify([]), 200
            return jsonify([{
                "name": a.get("name", ""),
                "image": a.get("images", [{}])[0].get("url") if a.get("images") else None,
                "genres": a.get("genres", [])[:2],
            } for a in resp.json().get("items", [])])
        except Exception:
            return jsonify([]), 200

    @app.route("/api/playlists")
    @login_required
    def get_playlists():
        if not current_user.spotify_token:
            return jsonify({"error": "Spotify not connected"}), 400
        try:
            resp = spotify.get("me/playlists", token={"access_token": current_user.spotify_token, "token_type": "Bearer"})
            if resp.status_code != 200:
                return jsonify({"error": "Spotify error"}), resp.status_code
            return jsonify([{
                "id": item.get("id"),
                "name": item.get("name", "Unknown"),
                "image": item.get("images", [{}])[0].get("url") if item.get("images") else None,
                "tracks": item.get("tracks", {}).get("total", 0) if item.get("tracks") else 0,
            } for item in resp.json().get("items", [])])
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/playlist/<playlist_id>")
    @login_required
    def get_playlist_tracks(playlist_id):
        if not current_user.spotify_token:
            return jsonify({"error": "Spotify not connected"}), 400
        try:
            resp = spotify.get(f"playlists/{playlist_id}/tracks", token={"access_token": current_user.spotify_token, "token_type": "Bearer"})
            if resp.status_code != 200:
                return jsonify({"error": "Spotify error"}), resp.status_code
            tracks = []
            for item in resp.json().get("items", []):
                t = item.get("track")
                if not t:
                    continue
                tracks.append({
                    "song_id": t.get("id"),
                    "title": t.get("name", "Unknown"),
                    "artist": (t.get("artists") or [{}])[0].get("name", "Unknown"),
                    "image": (t.get("album", {}).get("images") or [{}])[0].get("url"),
                    "preview_url": t.get("preview_url"),
                })
            return jsonify(tracks)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/search-tracks")
    @login_required
    def search_tracks():
        query = request.args.get("q", "")
        if not query or not current_user.spotify_token:
            return jsonify([]), 200
        try:
            resp = spotify.get(f"search?q={query}&type=track&limit=8", token={"access_token": current_user.spotify_token, "token_type": "Bearer"})
            if resp.status_code != 200:
                return jsonify([]), 200
            return jsonify([{
                "song_id": t.get("id"),
                "title": t.get("name", "Unknown"),
                "artist": (t.get("artists") or [{}])[0].get("name", "Unknown"),
                "image": (t.get("album", {}).get("images") or [{}])[0].get("url"),
                "preview_url": t.get("preview_url"),
            } for t in resp.json().get("tracks", {}).get("items", [])])
        except Exception:
            return jsonify([]), 200

    @app.route("/api/stream")
    @login_required
    def stream_audio():
        try:
            import yt_dlp
        except ImportError:
            return jsonify({"error": "yt-dlp not installed"}), 500

        query = request.args.get("q", "")
        if not query:
            return jsonify({"error": "No query"}), 400

        try:
            ydl_opts = {
                "format": "140/bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio",
                "quiet": True,
                "no_warnings": True,
                "extract_flat": False,
                "noplaylist": True,
                "ffmpeg_location": r"C:\ffmpeg-master-latest-win64-gpl\bin",
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                search_info = ydl.extract_info(f"ytsearch1:{query}", download=False)
                if not search_info or not search_info.get("entries"):
                    return jsonify({"error": "Not found on YouTube"}), 404
                entry = search_info["entries"][0]
                video_id = entry.get("id", "")
                if not video_id:
                    return jsonify({"error": "No video ID"}), 404

                full_info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                formats = full_info.get("formats", [])
                audio_url = None
                chosen_ext = "m4a"
                chosen_mime = "audio/mp4"

                # Priority 1: format 140 — YouTube's m4a 128kbps, works in ALL browsers
                for f in formats:
                    if f.get("format_id") == "140" and f.get("url"):
                        audio_url = f["url"]
                        break

                # Priority 2: any audio-only m4a
                if not audio_url:
                    for f in reversed(formats):
                        if (f.get("acodec") not in (None, "none")
                                and f.get("vcodec") in (None, "none", "")
                                and f.get("ext") == "m4a"
                                and f.get("url")):
                            audio_url = f["url"]
                            break

                # Priority 3: any mp4 with audio
                if not audio_url:
                    for f in reversed(formats):
                        if (f.get("acodec") not in (None, "none")
                                and f.get("ext") in ("mp4", "m4a")
                                and f.get("url")):
                            audio_url = f["url"]
                            chosen_ext = f.get("ext", "mp4")
                            break

                # Last resort: anything with audio
                if not audio_url:
                    for f in reversed(formats):
                        if f.get("acodec") not in (None, "none") and f.get("url"):
                            audio_url = f["url"]
                            chosen_ext = f.get("ext", "mp4")
                            break

                if not audio_url:
                    return jsonify({"error": "No playable audio format found"}), 404

                import urllib.parse
                proxy_url = f"/api/proxy-audio?u={urllib.parse.quote(audio_url, safe='')}&m={urllib.parse.quote(chosen_mime, safe='')}"

                return jsonify({
                    "url": proxy_url,
                    "ext": chosen_ext,
                    "mime": chosen_mime,
                    "title": full_info.get("title", entry.get("title", "")),
                    "duration": full_info.get("duration", 0),
                    "thumbnail": full_info.get("thumbnail", ""),
                })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/proxy-audio")
    @login_required
    def proxy_audio():
        import urllib.parse
        audio_url = urllib.parse.unquote(request.args.get("u", ""))
        mime_type = urllib.parse.unquote(request.args.get("m", "audio/mp4"))

        if not audio_url:
            return jsonify({"error": "No audio URL provided"}), 404

        range_header = request.headers.get("Range", None)
        yt_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "identity",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
            "Referer": "https://www.youtube.com/",
            "Origin": "https://www.youtube.com",
        }
        if range_header:
            yt_headers["Range"] = range_header

        try:
            yt_resp = req.get(audio_url, headers=yt_headers, stream=True, timeout=30)
            status_code = yt_resp.status_code

            def generate():
                for chunk in yt_resp.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk

            resp_headers = {
                "Content-Type": mime_type,
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            }
            for h in ("Content-Length", "Content-Range"):
                val = yt_resp.headers.get(h)
                if val:
                    resp_headers[h] = val

            return Response(stream_with_context(generate()), status=status_code, headers=resp_headers)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/me")
    @login_required
    def me():
        return jsonify({
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "following": Follow.query.filter_by(follower_id=current_user.id).count(),
            "followers": Follow.query.filter_by(followed_id=current_user.id).count(),
        })

    @app.route("/search-user")
    @login_required
    def search_user():
        username = request.args.get("username", "").strip()
        if not username:
            return jsonify({"error": "No username provided"}), 400
        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        already_following = bool(Follow.query.filter_by(follower_id=current_user.id, followed_id=user.id).first())
        return jsonify({"id": user.id, "username": user.username, "already_following": already_following})

    @app.route("/follow", methods=["POST"])
    @login_required
    def follow_user():
        target_id = request.json.get("user_id")
        if not target_id:
            return jsonify({"error": "user_id required"}), 400
        if target_id == current_user.id:
            return jsonify({"error": "Cannot follow yourself"}), 400
        target = User.query.get(target_id)
        if not target:
            return jsonify({"error": "User not found"}), 404
        if Follow.query.filter_by(follower_id=current_user.id, followed_id=target_id).first():
            return jsonify({"error": "Already following"}), 400
        db.session.add(Follow(follower_id=current_user.id, followed_id=target_id))
        db.session.commit()
        return jsonify({"message": f"Now following {target.username}"})

    @app.route("/unfollow", methods=["POST"])
    @login_required
    def unfollow_user():
        target_id = request.json.get("user_id")
        row = Follow.query.filter_by(follower_id=current_user.id, followed_id=target_id).first()
        if not row:
            return jsonify({"error": "Not following this user"}), 400
        db.session.delete(row)
        db.session.commit()
        return jsonify({"message": "Unfollowed"})

    @app.route("/api/following")
    @login_required
    def get_following():
        rows = Follow.query.filter_by(follower_id=current_user.id).all()
        return jsonify([{"id": u.id, "username": u.username} for row in rows for u in [User.query.get(row.followed_id)] if u])

    @app.route("/api/followers")
    @login_required
    def get_followers():
        rows = Follow.query.filter_by(followed_id=current_user.id).all()
        return jsonify([{"id": u.id, "username": u.username} for row in rows for u in [User.query.get(row.follower_id)] if u])

    @app.route("/api/my-groups")
    @login_required
    def my_groups():
        memberships = GroupMember.query.filter_by(user_id=current_user.id).all()
        result = []
        for m in memberships:
            g = Group.query.get(m.group_id)
            if g:
                result.append({"id": g.id, "name": g.name, "member_count": GroupMember.query.filter_by(group_id=g.id).count(), "created_by": g.created_by})
        return jsonify(result)

    @app.route("/create-group", methods=["POST"])
    @login_required
    def create_group():
        name = request.json.get("name", "").strip()
        member_ids = request.json.get("member_ids", [])
        if not name:
            return jsonify({"error": "Group name required"}), 400
        group = Group(name=name, created_by=current_user.id)
        db.session.add(group)
        db.session.flush()
        db.session.add(GroupMember(group_id=group.id, user_id=current_user.id))
        for uid in member_ids:
            if uid != current_user.id and User.query.get(uid):
                if not GroupMember.query.filter_by(group_id=group.id, user_id=uid).first():
                    db.session.add(GroupMember(group_id=group.id, user_id=uid))
        db.session.commit()
        return jsonify({"group_id": group.id, "name": group.name})

    @app.route("/add-member", methods=["POST"])
    @login_required
    def add_member():
        group_id = request.json.get("group_id")
        user_id = request.json.get("user_id")
        if not Group.query.get(group_id):
            return jsonify({"error": "Group not found"}), 404
        if not GroupMember.query.filter_by(group_id=group_id, user_id=current_user.id).first():
            return jsonify({"error": "Not a member"}), 403
        if not User.query.get(user_id):
            return jsonify({"error": "User not found"}), 404
        if GroupMember.query.filter_by(group_id=group_id, user_id=user_id).first():
            return jsonify({"error": "Already a member"}), 400
        db.session.add(GroupMember(group_id=group_id, user_id=user_id))
        db.session.commit()
        return jsonify({"message": "Member added"})

    @app.route("/api/group/<int:group_id>/members")
    @login_required
    def group_members(group_id):
        if not GroupMember.query.filter_by(group_id=group_id, user_id=current_user.id).first():
            return jsonify({"error": "Not a member"}), 403
        members = GroupMember.query.filter_by(group_id=group_id).all()
        return jsonify([{"id": u.id, "username": u.username} for m in members for u in [User.query.get(m.user_id)] if u])

    @app.route("/api/group/<int:group_id>/mutual-songs")
    @login_required
    def mutual_songs(group_id):
        if not GroupMember.query.filter_by(group_id=group_id, user_id=current_user.id).first():
            return jsonify({"error": "Not a member"}), 403
        members = GroupMember.query.filter_by(group_id=group_id).all()
        for m in members:
            u = User.query.get(m.user_id)
            if u and u.spotify_token:
                sync_spotify_history(u, spotify)
        return jsonify(compute_mutual_songs(group_id))

    @app.route("/add-friend", methods=["POST"])
    @login_required
    def add_friend():
        friend_id = request.json.get("friend_id")
        if friend_id == current_user.id:
            return jsonify({"error": "Cannot add yourself"}), 400
        if not User.query.get(friend_id):
            return jsonify({"error": "User not found"}), 404
        if Friend.query.filter_by(user_id=current_user.id, friend_id=friend_id).first():
            return jsonify({"error": "Already friends"}), 400
        db.session.add(Friend(user_id=current_user.id, friend_id=friend_id))
        db.session.add(Friend(user_id=friend_id, friend_id=current_user.id))
        db.session.commit()
        return jsonify({"message": "Friend added"})