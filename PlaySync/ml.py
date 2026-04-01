"""
ml.py — PlaySync Machine Learning Engine
-----------------------------------------
Collaborative Filtering (SVD) recommender built directly
on top of PlaySync's own database (UserSongHistory + Song).

Two public functions used by routes.py:
  - get_ml_mutual_songs(group_id)   → ranked list of mutual song dicts
  - get_ml_recommendations(user_id) → top-N song dicts for one user

The model is retrained automatically whenever the DB has grown
significantly since the last train (smart refresh logic).
"""

import os
import pickle
import logging
import numpy as np
from datetime import datetime
from collections import defaultdict

logger = logging.getLogger(__name__)

# ── paths ────────────────────────────────────────────────────────────────────
_DIR        = os.path.dirname(os.path.abspath(__file__))
_MODEL_PATH = os.path.join(_DIR, "instance", "ml_model.pkl")

# ── tunables ─────────────────────────────────────────────────────────────────
K                  = 20    # SVD latent factors
MIN_USER_PLAYS     = 3     # user must have >= N songs to be included
MIN_SONG_LISTENERS = 2     # song must have >= N users to be included
RETRAIN_THRESHOLD  = 20    # retrain if DB has grown by this many rows since last train
TOP_N_DEFAULT      = 10    # default recommendations returned

# ── in-memory cache ──────────────────────────────────────────────────────────
_model          = None     # the loaded/trained model dict
_last_row_count = 0        # how many rows were in DB when we last trained


# =============================================================================
#  INTERNAL — DATA LOADING
# =============================================================================

def _load_data():
    """Pull user_id, song_id (spotify_id), play_count from the live DB."""
    from models import db, UserSongHistory, Song

    rows = (
        db.session.query(
            UserSongHistory.user_id,
            Song.spotify_id,
            UserSongHistory.play_count,
            Song.title,
            Song.artist,
            Song.image_url,
            Song.preview_url,
        )
        .join(Song, UserSongHistory.song_id == Song.id)
        .all()
    )

    if not rows:
        return None, 0

    import pandas as pd
    df = pd.DataFrame(rows, columns=[
        "user_id", "song_id", "play_count",
        "title", "artist", "image_url", "preview_url"
    ])
    return df, len(df)


def _enough_data(df):
    """Check we have enough variety to train meaningfully."""
    if df is None or df.empty:
        return False
    if df["user_id"].nunique() < 2:
        return False
    if df["song_id"].nunique() < 2:
        return False
    return True


# =============================================================================
#  INTERNAL — TRAINING
# =============================================================================

def _train(df):
    """Train SVD model on the dataframe. Returns model dict or None."""
    try:
        from scipy.sparse import csr_matrix
        from scipy.sparse.linalg import svds

        # filter low-activity users / songs
        user_counts = df.groupby("user_id")["song_id"].count()
        df = df[df["user_id"].isin(user_counts[user_counts >= MIN_USER_PLAYS].index)]

        song_counts = df.groupby("song_id")["user_id"].count()
        df = df[df["song_id"].isin(song_counts[song_counts >= MIN_SONG_LISTENERS].index)]

        if not _enough_data(df):
            logger.warning("ml.py: not enough data after filtering to train.")
            return None

        users = df["user_id"].unique()
        songs = df["song_id"].unique()
        user_index = {u: i for i, u in enumerate(users)}
        song_index = {s: i for i, s in enumerate(songs)}

        rows_idx = df["user_id"].map(user_index).values
        cols_idx = df["song_id"].map(song_index).values
        vals     = np.log1p(df["play_count"].values.astype(float))

        R = csr_matrix(
            (vals, (rows_idx, cols_idx)),
            shape=(len(users), len(songs))
        )

        # demean per user
        user_means = np.array(R.mean(axis=1)).flatten()
        R_dem = R.copy().astype(np.float32)
        for i in range(len(users)):
            s, e = R_dem.indptr[i], R_dem.indptr[i + 1]
            R_dem.data[s:e] -= user_means[i]

        # cap K to valid range
        k = min(K, min(len(users), len(songs)) - 1)
        if k < 1:
            return None

        U, sigma, Vt = svds(R_dem, k=k)
        idx_sort = np.argsort(sigma)[::-1]
        U        = U[:, idx_sort]
        sigma    = sigma[idx_sort]
        Vt       = Vt[idx_sort, :]

        U_sigma = U * sigma

        # song metadata lookup (spotify_id -> dict)
        meta = (
            df.drop_duplicates("song_id")
            .set_index("song_id")[["title", "artist", "image_url", "preview_url"]]
            .to_dict("index")
        )

        model = {
            "U_sigma"    : U_sigma,
            "Vt"         : Vt,
            "user_means" : user_means,
            "user_index" : user_index,
            "song_index" : song_index,
            "users"      : users,
            "songs"      : songs,
            "meta"       : meta,
            "trained_at" : datetime.utcnow().isoformat(),
        }

        # persist to disk
        os.makedirs(os.path.dirname(_MODEL_PATH), exist_ok=True)
        with open(_MODEL_PATH, "wb") as f:
            pickle.dump(model, f)

        logger.info(
            f"ml.py: model trained — {len(users)} users, "
            f"{len(songs)} songs, k={k}"
        )
        return model

    except Exception as e:
        logger.error(f"ml.py: training failed — {e}")
        return None


# =============================================================================
#  INTERNAL — LOAD OR TRAIN
# =============================================================================

def _get_model(force_retrain=False):
    """
    Return the in-memory model, loading from disk or retraining as needed.
    Retrains automatically when the DB has grown by RETRAIN_THRESHOLD rows.
    """
    global _model, _last_row_count

    df, current_row_count = _load_data()

    needs_train = (
        force_retrain
        or _model is None
        or (current_row_count - _last_row_count) >= RETRAIN_THRESHOLD
    )

    if needs_train and _enough_data(df):
        _model = _train(df)
        _last_row_count = current_row_count

    # if still no model, try loading from disk
    if _model is None and os.path.exists(_MODEL_PATH):
        try:
            with open(_MODEL_PATH, "rb") as f:
                _model = pickle.load(f)
            logger.info("ml.py: model loaded from disk.")
        except Exception as e:
            logger.error(f"ml.py: failed to load model from disk — {e}")

    return _model, df


def _song_dict(song_id, score, meta):
    """Build a song response dict."""
    info = meta.get(song_id, {})
    return {
        "song_id"    : song_id,
        "title"      : info.get("title", "Unknown"),
        "artist"     : info.get("artist", "Unknown"),
        "image"      : info.get("image_url"),
        "preview_url": info.get("preview_url"),
        "ml_score"   : round(float(score), 4),
    }


# =============================================================================
#  PUBLIC — MUTUAL SONGS FOR A GROUP  (called by routes.py)
# =============================================================================

def get_ml_mutual_songs(group_id, top_n=TOP_N_DEFAULT):
    """
    Return top-N songs that ALL group members are likely to enjoy,
    ranked by average ML score across members.

    Falls back to overlap-based mutual if the model is not ready yet.

    Parameters
    ----------
    group_id : int
    top_n    : int

    Returns
    -------
    list of dicts:
        song_id, title, artist, image, preview_url,
        ml_score, shared_by, total_members
    """
    from models import db, GroupMember, UserSongHistory, Song

    members    = GroupMember.query.filter_by(group_id=group_id).all()
    member_ids = [m.user_id for m in members]

    if not member_ids:
        return []

    model, df = _get_model()

    # ML path (model available)
    if model is not None:
        U_sigma    = model["U_sigma"]
        Vt         = model["Vt"]
        user_means = model["user_means"]
        user_index = model["user_index"]
        songs      = model["songs"]
        meta       = model["meta"]

        known_scores = []
        for uid in member_ids:
            if uid in user_index:
                u_idx  = user_index[uid]
                scores = U_sigma[u_idx] @ Vt + user_means[u_idx]
                known_scores.append(scores)

        if not known_scores:
            return _fallback_mutual(group_id, member_ids)

        avg_scores = np.mean(known_scores, axis=0)
        ranked_idx = np.argsort(avg_scores)[::-1]

        # count how many members actually listened to each song (for display)
        song_member_counts = defaultdict(set)
        if df is not None and not df.empty:
            for uid in member_ids:
                listened = df[df["user_id"] == uid]["song_id"].values
                for sid in listened:
                    song_member_counts[sid].add(uid)

        results = []
        for idx in ranked_idx[:top_n]:
            sid   = songs[idx]
            score = avg_scores[idx]
            d     = _song_dict(sid, score, meta)
            d["shared_by"]     = len(song_member_counts.get(sid, set()))
            d["total_members"] = len(member_ids)
            results.append(d)

        return results

    return _fallback_mutual(group_id, member_ids)


def _fallback_mutual(group_id, member_ids):
    """
    Simple overlap fallback — songs listened to by >= 2 members.
    Used when the ML model has insufficient data.
    """
    from models import db, UserSongHistory, Song

    song_member_sets = defaultdict(set)
    song_objects     = {}

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

    threshold = max(2, len(member_ids))
    mutual    = []
    for spotify_id, member_set in song_member_sets.items():
        if len(member_set) >= threshold:
            song = song_objects[spotify_id]
            mutual.append({
                "song_id"      : song.spotify_id,
                "title"        : song.title,
                "artist"       : song.artist,
                "image"        : song.image_url,
                "preview_url"  : song.preview_url,
                "ml_score"     : 0.0,
                "shared_by"    : len(member_set),
                "total_members": len(member_ids),
            })

    mutual.sort(key=lambda x: (-x["shared_by"], x["title"]))
    return mutual


# =============================================================================
#  PUBLIC — SINGLE USER RECOMMENDATIONS
# =============================================================================

def get_ml_recommendations(user_id, top_n=TOP_N_DEFAULT, exclude_listened=True):
    """
    Return top-N personalised song recommendations for a single user.

    Parameters
    ----------
    user_id          : int
    top_n            : int
    exclude_listened : bool  — hide songs the user already played

    Returns
    -------
    list of dicts: song_id, title, artist, image, preview_url, ml_score
    """
    model, df = _get_model()

    if model is None:
        logger.warning("ml.py: model not ready for recommendations.")
        return []

    user_index = model["user_index"]
    if user_id not in user_index:
        logger.info(f"ml.py: user {user_id} not in model (too few plays).")
        return []

    U_sigma    = model["U_sigma"]
    Vt         = model["Vt"]
    user_means = model["user_means"]
    song_index = model["song_index"]
    songs      = model["songs"]
    meta       = model["meta"]

    u_idx  = user_index[user_id]
    scores = U_sigma[u_idx] @ Vt + user_means[u_idx]

    if exclude_listened and df is not None:
        listened = df[df["user_id"] == user_id]["song_id"].values
        for sid in listened:
            if sid in song_index:
                scores[song_index[sid]] = -np.inf

    top_idx = np.argsort(scores)[::-1][:top_n]
    return [_song_dict(songs[i], scores[i], meta) for i in top_idx]


# =============================================================================
#  PUBLIC — FORCE RETRAIN
# =============================================================================

def retrain():
    """Force a full retrain. Returns True on success."""
    global _model, _last_row_count
    _model = None
    model, _ = _get_model(force_retrain=True)
    return model is not None
