from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, login_required, logout_user, UserMixin
from datetime import timedelta

app = Flask(__name__)

# ---------------- CONFIG ----------------
app.config["SECRET_KEY"] = "supersecretkey"
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///app.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["REMEMBER_COOKIE_DURATION"] = timedelta(days=365)
app.permanent_session_lifetime = timedelta(days=30)

db = SQLAlchemy(app)

# ---------------- LOGIN MANAGER ----------------
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login_page"


# ---------------- USER MODEL ----------------
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# Create database
with app.app_context():
    db.create_all()


# ---------------- ROUTES ----------------

# Default → Login page
@app.route("/")
def login_page():
    return render_template("login.html")


# LOGIN (Auto create account if not exists)
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"success": False, "message": "Missing fields"}), 400

    user = User.query.filter_by(email=email).first()

    if user:
        if user.password != password:
            return jsonify({"success": False, "message": "Wrong password"}), 401
    else:
        # Create account automatically
        user = User(email=email, password=password)
        db.session.add(user)
        db.session.commit()

    login_user(user, remember=True)

    return jsonify({"success": True})


# HOME
@app.route("/home")
@login_required
def home():
    return render_template("home.html")


# PROFILE
@app.route("/profile")
@login_required
def profile():
    return render_template("profile.html")


# GROUPS
@app.route("/group")
@login_required
def group():
    return render_template("group.html")


# GAME
@app.route("/game")
@login_required
def game():
    return render_template("game.html")


# LOGOUT
@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login_page"))


if __name__ == "__main__":
    app.run(debug=True)
