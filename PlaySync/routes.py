from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import db, User, Group, Playlist, Message
from ml import generate_mutual_songs
from datetime import timedelta

api = Blueprint("api", __name__)

# ================= AUTH =================

@api.route("/auth/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    name = data.get("name")
    profile_pic = data.get("profile_pic")

    if not email:
        return jsonify({"error": "Email required"}), 400

    user = User.query.filter_by(email=email).first()

    if not user:
        user = User(email=email, name=name, profile_pic=profile_pic)
        db.session.add(user)
        db.session.commit()

    access_token = create_access_token(identity=user.id, expires_delta=timedelta(days=30))

    return jsonify({"token": access_token})


@api.route("/home", methods=["GET"])
@jwt_required()
def home():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    playlists = [
        {"id": p.id, "name": p.name}
        for p in user.playlists
    ]

    return jsonify({
        "name": user.name,
        "email": user.email,
        "playlists": playlists
    })


# ================= PROFILE =================

@api.route("/profile", methods=["GET"])
@jwt_required()
def profile():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    return jsonify({
        "name": user.name,
        "email": user.email,
        "groups_count": len(user.groups),
        "playlists_count": len(user.playlists)
    })


# ================= GROUP =================

@api.route("/groups", methods=["POST"])
@jwt_required()
def create_group():
    user_id = get_jwt_identity()
    data = request.json
    name = data.get("name")
    member_ids = data.get("members", [])

    group = Group(name=name)
    db.session.add(group)
    db.session.commit()

    group.members.append(User.query.get(user_id))

    for m in member_ids:
        member = User.query.get(m)
        if member:
            group.members.append(member)

    db.session.commit()

    return jsonify({"message": "Group created"})


@api.route("/groups", methods=["GET"])
@jwt_required()
def get_groups():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    groups = [
        {"id": g.id, "name": g.name}
        for g in user.groups
    ]

    return jsonify(groups)


@api.route("/groups/<int:group_id>/generate-playlist", methods=["POST"])
@jwt_required()
def generate_playlist(group_id):
    group = Group.query.get(group_id)
    if not group:
        return jsonify({"error": "Group not found"}), 404

    user_ids = [member.id for member in group.members]
    songs = generate_mutual_songs(user_ids)

    playlist = Playlist(
        name=f"Mutual Playlist - {group.name}",
        songs=str(songs),
        user_id=user_ids[0]
    )

    db.session.add(playlist)
    db.session.commit()

    return jsonify({"songs": songs})


# ================= CHAT =================

@api.route("/groups/<int:group_id>/chat", methods=["POST"])
@jwt_required()
def send_message(group_id):
    user_id = get_jwt_identity()
    data = request.json
    content = data.get("content")

    message = Message(
        content=content,
        user_id=user_id,
        group_id=group_id
    )

    db.session.add(message)
    db.session.commit()

    return jsonify({"message": "Sent"})


@api.route("/groups/<int:group_id>/chat", methods=["GET"])
@jwt_required()
def get_messages(group_id):
    messages = Message.query.filter_by(group_id=group_id).all()

    return jsonify([
        {
            "user_id": m.user_id,
            "content": m.content,
            "timestamp": m.timestamp
        }
        for m in messages
    ])
