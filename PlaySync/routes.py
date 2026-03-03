from flask import render_template, redirect, request, url_for, jsonify
from flask_login import login_user, login_required, current_user
from authlib.integrations.flask_client import OAuth
from models import db, User, Friend, Group, GroupMember


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
                "user-read-private "
                "user-read-email "
                "playlist-read-private "
                "playlist-read-collaborative "
                "user-read-playback-state "
                "user-modify-playback-state "
                "user-read-currently-playing "
                "user-top-read "
                "user-read-recently-played "
                "streaming"
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

    # ---------------- LOGIN PAGE ---------------- #

    @app.route("/")
    def login_page():
        return render_template("login.html")

    @app.route("/login/spotify")
    def login_spotify():
        return spotify.authorize_redirect(redirect_uri=app.config["SPOTIFY_REDIRECT_URI"])

    @app.route("/callback/spotify")
    def callback_spotify():
        token = spotify.authorize_access_token()
        resp = spotify.get(
            "me",
            token={"access_token": token["access_token"], "token_type": "Bearer"}
        )
        if resp.status_code != 200:
            return f"Spotify API error: {resp.status_code} - {resp.text}", 400
        profile = resp.json()
        email = profile.get("email")
        if not email:
            return "Spotify account has no email.", 400
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(
                username=profile["display_name"],
                email=email,
                auth_provider="spotify",
                provider_id=profile["id"],
            )
            db.session.add(user)
        user.spotify_token = token["access_token"]
        user.spotify_refresh_token = token.get("refresh_token")
        db.session.commit()
        login_user(user)
        return redirect("/home")

    # ---------------- GOOGLE LOGIN ---------------- #

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
            user = User(
                username=userinfo.get("name"),
                email=email,
                auth_provider="google",
                provider_id=userinfo.get("sub"),
            )
            db.session.add(user)
        db.session.commit()
        login_user(user)
        return redirect("/home")

    # ---------------- HOME ---------------- #

    @app.route("/home")
    @login_required
    def home():
        return render_template("home.html", user=current_user)

    # ---------------- GROUP PAGE ---------------- #

    @app.route("/group")
    @login_required
    def group():
        return render_template("group.html")

    @app.route("/group/<int:group_id>")
    @login_required
    def group_page(group_id):
        group = Group.query.get(group_id)
        if not group:
            return jsonify({"error": "Group not found"}), 404
        if not GroupMember.query.filter_by(group_id=group_id, user_id=current_user.id).first():
            return jsonify({"error": "You are not a member of this group"}), 403
        return render_template("group.html", group_id=group_id)

    # ---------------- GAME PAGE ---------------- #

    @app.route("/game")
    @login_required
    def game():
        return render_template("game.html")

    # ---------------- SPOTIFY TOKEN ---------------- #

    @app.route("/api/spotify-token")
    @login_required
    def get_spotify_token():
        return jsonify({"token": current_user.spotify_token})

    # ---------------- PROFILE ---------------- #

    @app.route("/profile")
    @login_required
    def profile():
        return render_template("profile.html", user=current_user)

    # ---------------- SEARCH USER ---------------- #

    @app.route("/search-user")
    @login_required
    def search_user():
        username = request.args.get("username")
        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify({"id": user.id, "username": user.username})

    # ---------------- ADD FRIEND ---------------- #

    @app.route("/add-friend", methods=["POST"])
    @login_required
    def add_friend():
        friend_id = request.json.get("friend_id")
        if friend_id == current_user.id:
            return jsonify({"error": "Cannot add yourself"}), 400
        friend = User.query.get(friend_id)
        if not friend:
            return jsonify({"error": "User not found"}), 404
        if Friend.query.filter_by(user_id=current_user.id, friend_id=friend_id).first():
            return jsonify({"error": "Already friends"}), 400
        db.session.add(Friend(user_id=current_user.id, friend_id=friend_id))
        db.session.add(Friend(user_id=friend_id, friend_id=current_user.id))
        db.session.commit()
        return jsonify({"message": "Friend added"})

    # ---------------- CREATE GROUP ---------------- #

    @app.route("/create-group", methods=["POST"])
    @login_required
    def create_group():
        name = request.json.get("name")
        group = Group(name=name, created_by=current_user.id)
        db.session.add(group)
        db.session.commit()
        db.session.add(GroupMember(group_id=group.id, user_id=current_user.id))
        db.session.commit()
        return jsonify({"group_id": group.id})

    # ---------------- ADD MEMBER ---------------- #

    @app.route("/add-member", methods=["POST"])
    @login_required
    def add_member():
        group_id = request.json.get("group_id")
        user_id = request.json.get("user_id")
        group = Group.query.get(group_id)
        if not group:
            return jsonify({"error": "Group not found"}), 404
        if not GroupMember.query.filter_by(group_id=group_id, user_id=current_user.id).first():
            return jsonify({"error": "You are not a member of this group"}), 403
        if not User.query.get(user_id):
            return jsonify({"error": "User not found"}), 404
        if GroupMember.query.filter_by(group_id=group_id, user_id=user_id).first():
            return jsonify({"error": "User is already a member"}), 400
        db.session.add(GroupMember(group_id=group_id, user_id=user_id))
        db.session.commit()
        return jsonify({"message": "Member added"})