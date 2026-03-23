from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, admin_required
from services.auth_service import hash_password
from utils.db import query, query_one, execute
from utils.validators import validate_email, validate_password

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    role = request.args.get('role')
    search = request.args.get('search')

    sql = "SELECT id, email, first_name, last_name, role, is_active, mfa_enabled, created_at FROM users WHERE 1=1"
    params = []

    if role:
        sql += " AND role = ?"
        params.append(role)
    if search:
        sql += " AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)"
        params.extend([f"%{search}%"] * 3)

    total = query_one(sql.replace("SELECT id, email, first_name, last_name, role, is_active, mfa_enabled, created_at", "SELECT COUNT(*) as cnt"), params)['cnt']

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([per_page, (page - 1) * per_page])

    users = query(sql, params)
    return jsonify({
        "users": users,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page
    })


@admin_bp.route('/users', methods=['POST'])
@admin_required
def create_user():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    if not validate_email(data.get('email', '')):
        return jsonify({"error": "Invalid email"}), 400

    password = data.get('password', 'Temp@1234')
    user_id = execute(
        "INSERT INTO users (email, password_hash, first_name, last_name, role, must_reset_pw) VALUES (?, ?, ?, ?, ?, 1)",
        (data['email'], hash_password(password), data['first_name'], data['last_name'], data.get('role', 'student'))
    )

    return jsonify({"message": "User created", "user_id": user_id}), 201


@admin_bp.route('/users/<int:user_id>/toggle-active', methods=['POST'])
@admin_required
def toggle_user_active(user_id):
    user = query_one("SELECT * FROM users WHERE id = ?", (user_id,))
    if not user:
        return jsonify({"error": "User not found"}), 404

    new_val = 0 if user['is_active'] else 1
    execute("UPDATE users SET is_active = ? WHERE id = ?", (new_val, user_id))
    return jsonify({"message": f"User {'activated' if new_val else 'deactivated'}"})


@admin_bp.route('/users/<int:user_id>/reset-password', methods=['POST'])
@admin_required
def admin_reset_password(user_id):
    temp_password = 'Temp@1234'
    execute(
        "UPDATE users SET password_hash = ?, must_reset_pw = 1 WHERE id = ?",
        (hash_password(temp_password), user_id)
    )
    return jsonify({"message": "Password reset. Temporary password: " + temp_password})


@admin_bp.route('/stats', methods=['GET'])
@admin_required
def system_stats():
    stats = {
        "total_users": query_one("SELECT COUNT(*) as cnt FROM users")['cnt'],
        "total_students": query_one("SELECT COUNT(*) as cnt FROM users WHERE role = 'student'")['cnt'],
        "total_faculty": query_one("SELECT COUNT(*) as cnt FROM users WHERE role = 'faculty'")['cnt'],
        "total_courses": query_one("SELECT COUNT(*) as cnt FROM courses")['cnt'],
        "active_enrollments": query_one("SELECT COUNT(*) as cnt FROM enrollments WHERE status = 'active'")['cnt'],
        "total_submissions": query_one("SELECT COUNT(*) as cnt FROM submissions")['cnt'],
        "total_exams": query_one("SELECT COUNT(*) as cnt FROM exams")['cnt'],
    }
    return jsonify({"stats": stats})
