from flask import Flask
from flask_login import LoginManager
from flask_cors import CORS

from config import Config
from models import db, User
from routes import init_routes

app = Flask(__name__)
app.config.from_object(Config)

# Required for session (Spotify tokens stored here)
app.secret_key = app.config.get("SECRET_KEY", "supersecret")

db.init_app(app)
CORS(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login_page"

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

init_routes(app)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)
    