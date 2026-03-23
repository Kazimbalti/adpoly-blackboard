import os
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
from config import Config
from utils.db import close_db, init_db
from routes import register_blueprints


def create_app():
    app = Flask(__name__, static_folder='static', template_folder='templates')
    app.config.from_object(Config)

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    register_blueprints(app)

    app.teardown_appcontext(close_db)

    @app.route('/')
    def index():
        return send_from_directory('templates', 'index.html')

    @app.route('/health')
    def health():
        return jsonify({"status": "ok", "app": "ADPOLY Blackboard LMS"})

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found", "path": str(e)}), 404

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"error": "File too large. Maximum size is 50MB."}), 413

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500

    with app.app_context():
        init_db()

    return app
