from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from utils.db import query, query_one, execute
from utils.validators import validate_required, sanitize_html

forums_bp = Blueprint('forums', __name__)


@forums_bp.route('/course/<int:course_id>', methods=['GET'])
@login_required
def list_threads(course_id):
    threads = query(
        """SELECT ft.*, u.first_name, u.last_name,
                  (SELECT COUNT(*) FROM forum_posts WHERE thread_id = ft.id) as reply_count,
                  (SELECT MAX(created_at) FROM forum_posts WHERE thread_id = ft.id) as last_reply_at
           FROM forum_threads ft
           JOIN users u ON u.id = ft.author_id
           WHERE ft.course_id = ?
           ORDER BY ft.is_pinned DESC, COALESCE(last_reply_at, ft.created_at) DESC""",
        (course_id,)
    )
    return jsonify({"threads": threads})


@forums_bp.route('/course/<int:course_id>', methods=['POST'])
@login_required
def create_thread(course_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    valid, msg = validate_required(data, ['title', 'body'])
    if not valid:
        return jsonify({"error": msg}), 400

    thread_id = execute(
        "INSERT INTO forum_threads (course_id, author_id, title, body) VALUES (?, ?, ?, ?)",
        (course_id, g.current_user['id'], data['title'], sanitize_html(data['body']))
    )

    thread = query_one("SELECT * FROM forum_threads WHERE id = ?", (thread_id,))
    return jsonify({"message": "Thread created", "thread": thread}), 201


@forums_bp.route('/threads/<int:thread_id>', methods=['GET'])
@login_required
def get_thread(thread_id):
    thread = query_one(
        """SELECT ft.*, u.first_name, u.last_name, u.role
           FROM forum_threads ft JOIN users u ON u.id = ft.author_id
           WHERE ft.id = ?""",
        (thread_id,)
    )
    if not thread:
        return jsonify({"error": "Thread not found"}), 404

    # Increment view count
    execute("UPDATE forum_threads SET view_count = view_count + 1 WHERE id = ?", (thread_id,))

    posts = query(
        """SELECT fp.*, u.first_name, u.last_name, u.role, u.avatar_path
           FROM forum_posts fp JOIN users u ON u.id = fp.author_id
           WHERE fp.thread_id = ?
           ORDER BY fp.created_at ASC""",
        (thread_id,)
    )

    return jsonify({"thread": thread, "posts": posts})


@forums_bp.route('/threads/<int:thread_id>/reply', methods=['POST'])
@login_required
def reply_to_thread(thread_id):
    thread = query_one("SELECT * FROM forum_threads WHERE id = ?", (thread_id,))
    if not thread:
        return jsonify({"error": "Thread not found"}), 404
    if thread['is_locked']:
        return jsonify({"error": "Thread is locked"}), 403

    data = request.get_json()
    if not data or not data.get('body'):
        return jsonify({"error": "Reply body required"}), 400

    post_id = execute(
        "INSERT INTO forum_posts (thread_id, author_id, parent_id, body) VALUES (?, ?, ?, ?)",
        (thread_id, g.current_user['id'], data.get('parent_id'), sanitize_html(data['body']))
    )

    execute("UPDATE forum_threads SET updated_at = datetime('now') WHERE id = ?", (thread_id,))

    post = query_one(
        """SELECT fp.*, u.first_name, u.last_name, u.role
           FROM forum_posts fp JOIN users u ON u.id = fp.author_id
           WHERE fp.id = ?""",
        (post_id,)
    )
    return jsonify({"message": "Reply posted", "post": post}), 201


@forums_bp.route('/threads/<int:thread_id>/pin', methods=['POST'])
@faculty_required
def pin_thread(thread_id):
    thread = query_one("SELECT * FROM forum_threads WHERE id = ?", (thread_id,))
    if not thread:
        return jsonify({"error": "Thread not found"}), 404

    new_val = 0 if thread['is_pinned'] else 1
    execute("UPDATE forum_threads SET is_pinned = ? WHERE id = ?", (new_val, thread_id))
    return jsonify({"message": f"Thread {'pinned' if new_val else 'unpinned'}"})


@forums_bp.route('/threads/<int:thread_id>/lock', methods=['POST'])
@faculty_required
def lock_thread(thread_id):
    thread = query_one("SELECT * FROM forum_threads WHERE id = ?", (thread_id,))
    if not thread:
        return jsonify({"error": "Thread not found"}), 404

    new_val = 0 if thread['is_locked'] else 1
    execute("UPDATE forum_threads SET is_locked = ? WHERE id = ?", (new_val, thread_id))
    return jsonify({"message": f"Thread {'locked' if new_val else 'unlocked'}"})


@forums_bp.route('/threads/<int:thread_id>', methods=['DELETE'])
@faculty_required
def delete_thread(thread_id):
    execute("DELETE FROM forum_threads WHERE id = ?", (thread_id,))
    return jsonify({"message": "Thread deleted"})
