from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime

db = SQLAlchemy()


# ─── USER ────────────────────────────────────────────────────
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    auth_provider = db.Column(db.String(20))
    provider_id = db.Column(db.String(200))
    spotify_token = db.Column(db.String(500))
    spotify_refresh_token = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    song_history = db.relationship("UserSongHistory", backref="user", lazy=True)
    following = db.relationship(
        "Follow", foreign_keys="Follow.follower_id", backref="follower", lazy=True
    )
    followers_rel = db.relationship(
        "Follow", foreign_keys="Follow.followed_id", backref="followed", lazy=True
    )


# ─── SONG CATALOG ────────────────────────────────────────────
class Song(db.Model):
    """Master song record — one row per unique Spotify track ID."""
    id = db.Column(db.Integer, primary_key=True)
    spotify_id = db.Column(db.String(100), unique=True, nullable=False)
    title = db.Column(db.String(300), nullable=False)
    artist = db.Column(db.String(300))
    album = db.Column(db.String(300))
    image_url = db.Column(db.String(500))
    preview_url = db.Column(db.String(500))
    duration_ms = db.Column(db.Integer)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)


# ─── USER SONG HISTORY ───────────────────────────────────────
class UserSongHistory(db.Model):
    """Upserted on every app-open: recently-played + top tracks."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    song_id = db.Column(db.Integer, db.ForeignKey("song.id"), nullable=False)
    play_count = db.Column(db.Integer, default=1)
    # 'recent' | 'top_short' | 'top_medium' | 'top_long'
    source = db.Column(db.String(20), default="recent")
    last_played = db.Column(db.DateTime, default=datetime.utcnow)
    first_seen = db.Column(db.DateTime, default=datetime.utcnow)

    song = db.relationship("Song", backref="history_entries", lazy=True)

    __table_args__ = (
        db.UniqueConstraint("user_id", "song_id", name="uq_user_song"),
    )


# ─── FOLLOW ──────────────────────────────────────────────────
class Follow(db.Model):
    """Directional follow. Mutual = friendship in UI."""
    id = db.Column(db.Integer, primary_key=True)
    follower_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    followed_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("follower_id", "followed_id", name="uq_follow"),
    )


# ─── GROUP ───────────────────────────────────────────────────
class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    members = db.relationship("GroupMember", backref="group", lazy=True)


class GroupMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("group.id"))
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("group_id", "user_id", name="uq_group_member"),
    )


# ─── LEGACY ──────────────────────────────────────────────────
class Friend(db.Model):
    """Kept so existing DB rows don't break. New code uses Follow."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    friend_id = db.Column(db.Integer, db.ForeignKey("user.id"))
