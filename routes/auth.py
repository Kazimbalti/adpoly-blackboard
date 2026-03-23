from flask import Blueprint, request, jsonify, g
from services.auth_service import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, verify_refresh_token, revoke_refresh_token,
    create_password_reset_token, verify_password_reset_token, use_password_reset_token
)
from services.mfa_service import (
    generate_mfa_secret, verify_mfa_code, generate_qr_code,
    enable_mfa, disable_mfa, get_user_mfa_secret
)
from middleware.auth_middleware import login_required
from middleware.rate_limit import rate_limit
from utils.db import query_one, execute
from utils.validators import validate_email, validate_password, validate_required

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=60)
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request body"}), 400

    valid, msg = validate_required(data, ['email', 'password', 'first_name', 'last_name', 'role'])
    if not valid:
        return jsonify({"error": msg}), 400

    if not validate_email(data['email']):
        return jsonify({"error": "Invalid email format"}), 400

    valid, msg = validate_password(data['password'])
    if not valid:
        return jsonify({"error": msg}), 400

    if data['role'] not in ('faculty', 'student'):
        return jsonify({"error": "Role must be 'faculty' or 'student'"}), 400

    existing = query_one("SELECT id FROM users WHERE email = ?", (data['email'],))
    if existing:
        return jsonify({"error": "Email already registered"}), 409

    user_id = execute(
        "INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)",
        (data['email'], hash_password(data['password']), data['first_name'], data['last_name'], data['role'])
    )

    user = query_one("SELECT id, email, first_name, last_name, role FROM users WHERE id = ?", (user_id,))
    access_token = create_access_token(user_id, data['role'])
    refresh_token = create_refresh_token(user_id, request.remote_addr, request.user_agent.string)

    return jsonify({
        "message": "Registration successful",
        "user": user,
        "access_token": access_token,
        "refresh_token": refresh_token
    }), 201


@auth_bp.route('/login', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=60)
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request body"}), 400

    valid, msg = validate_required(data, ['email', 'password'])
    if not valid:
        return jsonify({"error": msg}), 400

    user = query_one("SELECT * FROM users WHERE email = ? AND is_active = 1", (data['email'],))
    if not user or not verify_password(data['password'], user['password_hash']):
        return jsonify({"error": "Invalid email or password"}), 401

    if user['mfa_enabled']:
        if not data.get('mfa_code'):
            return jsonify({"error": "MFA code required", "mfa_required": True}), 200
        if not verify_mfa_code(user['mfa_secret'], data['mfa_code']):
            return jsonify({"error": "Invalid MFA code"}), 401

    access_token = create_access_token(user['id'], user['role'])
    refresh_token = create_refresh_token(user['id'], request.remote_addr, request.user_agent.string)

    execute(
        "INSERT INTO activity_log (user_id, action, ip_address) VALUES (?, 'login', ?)",
        (user['id'], request.remote_addr)
    )

    return jsonify({
        "message": "Login successful",
        "user": {
            "id": user['id'],
            "email": user['email'],
            "first_name": user['first_name'],
            "last_name": user['last_name'],
            "role": user['role'],
            "avatar_path": user['avatar_path'],
            "mfa_enabled": bool(user['mfa_enabled']),
            "must_reset_pw": bool(user['must_reset_pw'])
        },
        "access_token": access_token,
        "refresh_token": refresh_token
    })


@auth_bp.route('/refresh', methods=['POST'])
def refresh():
    data = request.get_json()
    if not data or not data.get('refresh_token'):
        return jsonify({"error": "Refresh token required"}), 400

    session = verify_refresh_token(data['refresh_token'])
    if not session:
        return jsonify({"error": "Invalid or expired refresh token"}), 401

    user = query_one("SELECT * FROM users WHERE id = ? AND is_active = 1", (session['user_id'],))
    if not user:
        return jsonify({"error": "User not found"}), 401

    revoke_refresh_token(data['refresh_token'])
    access_token = create_access_token(user['id'], user['role'])
    new_refresh = create_refresh_token(user['id'], request.remote_addr, request.user_agent.string)

    return jsonify({
        "access_token": access_token,
        "refresh_token": new_refresh
    })


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    data = request.get_json() or {}
    if data.get('refresh_token'):
        revoke_refresh_token(data['refresh_token'])
    return jsonify({"message": "Logged out successfully"})


@auth_bp.route('/password-reset/request', methods=['POST'])
@rate_limit(max_requests=3, window_seconds=60)
def request_password_reset():
    data = request.get_json()
    if not data or not data.get('email'):
        return jsonify({"error": "Email required"}), 400

    user = query_one("SELECT id FROM users WHERE email = ?", (data['email'],))
    if user:
        token = create_password_reset_token(user['id'])
        # In production, send email. For prototype, return the token.
        return jsonify({"message": "If the email exists, a reset link has been sent", "reset_token": token})

    return jsonify({"message": "If the email exists, a reset link has been sent"})


@auth_bp.route('/password-reset/confirm', methods=['POST'])
def confirm_password_reset():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    valid, msg = validate_required(data, ['token', 'new_password'])
    if not valid:
        return jsonify({"error": msg}), 400

    valid, msg = validate_password(data['new_password'])
    if not valid:
        return jsonify({"error": msg}), 400

    reset = verify_password_reset_token(data['token'])
    if not reset:
        return jsonify({"error": "Invalid or expired reset token"}), 400

    execute(
        "UPDATE users SET password_hash = ?, must_reset_pw = 0, updated_at = datetime('now') WHERE id = ?",
        (hash_password(data['new_password']), reset['user_id'])
    )
    use_password_reset_token(data['token'])

    return jsonify({"message": "Password reset successfully"})


@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    valid, msg = validate_required(data, ['current_password', 'new_password'])
    if not valid:
        return jsonify({"error": msg}), 400

    if not verify_password(data['current_password'], g.current_user['password_hash']):
        return jsonify({"error": "Current password is incorrect"}), 401

    valid, msg = validate_password(data['new_password'])
    if not valid:
        return jsonify({"error": msg}), 400

    execute(
        "UPDATE users SET password_hash = ?, must_reset_pw = 0, updated_at = datetime('now') WHERE id = ?",
        (hash_password(data['new_password']), g.current_user['id'])
    )

    return jsonify({"message": "Password changed successfully"})


@auth_bp.route('/mfa/setup', methods=['POST'])
@login_required
def setup_mfa():
    secret = generate_mfa_secret()
    qr_data = generate_qr_code(g.current_user['email'], secret)
    return jsonify({
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_data}"
    })


@auth_bp.route('/mfa/enable', methods=['POST'])
@login_required
def enable_mfa_route():
    data = request.get_json()
    if not data or not data.get('secret') or not data.get('code'):
        return jsonify({"error": "Secret and verification code required"}), 400

    if not verify_mfa_code(data['secret'], data['code']):
        return jsonify({"error": "Invalid verification code"}), 400

    enable_mfa(g.current_user['id'], data['secret'])
    return jsonify({"message": "MFA enabled successfully"})


@auth_bp.route('/mfa/disable', methods=['POST'])
@login_required
def disable_mfa_route():
    data = request.get_json()
    if not data or not data.get('password'):
        return jsonify({"error": "Password required to disable MFA"}), 400

    if not verify_password(data['password'], g.current_user['password_hash']):
        return jsonify({"error": "Invalid password"}), 401

    disable_mfa(g.current_user['id'])
    return jsonify({"message": "MFA disabled successfully"})


@auth_bp.route('/me', methods=['GET'])
@login_required
def get_profile():
    user = g.current_user
    return jsonify({
        "id": user['id'],
        "email": user['email'],
        "first_name": user['first_name'],
        "last_name": user['last_name'],
        "role": user['role'],
        "avatar_path": user['avatar_path'],
        "mfa_enabled": bool(user['mfa_enabled']),
        "must_reset_pw": bool(user['must_reset_pw']),
        "created_at": user['created_at']
    })


@auth_bp.route('/me', methods=['PUT'])
@login_required
def update_profile():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    updates = []
    params = []
    for field in ['first_name', 'last_name']:
        if data.get(field):
            updates.append(f"{field} = ?")
            params.append(data[field])

    if not updates:
        return jsonify({"error": "No fields to update"}), 400

    updates.append("updated_at = datetime('now')")
    params.append(g.current_user['id'])

    execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)

    user = query_one(
        "SELECT id, email, first_name, last_name, role, avatar_path, mfa_enabled FROM users WHERE id = ?",
        (g.current_user['id'],)
    )
    return jsonify({"message": "Profile updated", "user": user})
