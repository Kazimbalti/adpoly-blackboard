from functools import wraps
from flask import request, jsonify, g
from services.auth_service import verify_access_token
from utils.db import query_one


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"error": "Missing authorization token"}), 401

        token = auth_header.replace('Bearer ', '')
        payload = verify_access_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401

        user = query_one("SELECT * FROM users WHERE id = ? AND is_active = 1", (int(payload['sub']),))
        if not user:
            return jsonify({"error": "User not found or inactive"}), 401

        g.current_user = user
        return f(*args, **kwargs)
    return decorated


def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(g, 'current_user') or not g.current_user:
                return jsonify({"error": "Unauthorized"}), 401
            if g.current_user['role'] not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator


def faculty_required(f):
    @wraps(f)
    @login_required
    @role_required('faculty', 'admin')
    def decorated(*args, **kwargs):
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    @login_required
    @role_required('admin')
    def decorated(*args, **kwargs):
        return f(*args, **kwargs)
    return decorated
