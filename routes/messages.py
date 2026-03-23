from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required
from utils.db import query, query_one, execute
from utils.validators import sanitize_html

messages_bp = Blueprint('messages', __name__)


@messages_bp.route('/inbox', methods=['GET'])
@login_required
def get_inbox():
    conversations = query(
        """SELECT c.*, cp.last_read_at,
                  (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                  (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
                  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
                   AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
           FROM conversations c
           JOIN conversation_participants cp ON cp.conversation_id = c.id
           WHERE cp.user_id = ?
           ORDER BY last_message_at DESC""",
        (g.current_user['id'],)
    )

    for conv in conversations:
        participants = query(
            """SELECT u.id, u.first_name, u.last_name, u.role
               FROM users u
               JOIN conversation_participants cp ON cp.user_id = u.id
               WHERE cp.conversation_id = ? AND u.id != ?""",
            (conv['id'], g.current_user['id'])
        )
        conv['participants'] = participants

    return jsonify({"conversations": conversations})


@messages_bp.route('/conversations', methods=['POST'])
@login_required
def create_conversation():
    data = request.get_json()
    if not data or not data.get('recipient_id') or not data.get('body'):
        return jsonify({"error": "recipient_id and body required"}), 400

    recipient = query_one("SELECT id FROM users WHERE id = ?", (data['recipient_id'],))
    if not recipient:
        return jsonify({"error": "Recipient not found"}), 404

    # Check for existing conversation between these two users
    existing = query_one(
        """SELECT cp1.conversation_id FROM conversation_participants cp1
           JOIN conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
           JOIN conversations c ON c.id = cp1.conversation_id
           WHERE cp1.user_id = ? AND cp2.user_id = ? AND c.course_id IS NULL""",
        (g.current_user['id'], data['recipient_id'])
    )

    if existing:
        conv_id = existing['conversation_id']
    else:
        conv_id = execute(
            "INSERT INTO conversations (subject, course_id) VALUES (?, ?)",
            (data.get('subject', ''), data.get('course_id'))
        )
        execute(
            "INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)",
            (conv_id, g.current_user['id'])
        )
        execute(
            "INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)",
            (conv_id, data['recipient_id'])
        )

    msg_id = execute(
        "INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)",
        (conv_id, g.current_user['id'], sanitize_html(data['body']))
    )

    # Update last read for sender
    execute(
        "UPDATE conversation_participants SET last_read_at = datetime('now') WHERE conversation_id = ? AND user_id = ?",
        (conv_id, g.current_user['id'])
    )

    # Notify recipient
    execute(
        "INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)",
        (data['recipient_id'], f"New message from {g.current_user['first_name']}",
         data['body'][:100], f"#/messages/{conv_id}")
    )

    return jsonify({"message": "Message sent", "conversation_id": conv_id}), 201


@messages_bp.route('/conversations/<int:conv_id>', methods=['GET'])
@login_required
def get_conversation(conv_id):
    # Verify participant
    participant = query_one(
        "SELECT * FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
        (conv_id, g.current_user['id'])
    )
    if not participant:
        return jsonify({"error": "Not a participant"}), 403

    messages = query(
        """SELECT m.*, u.first_name, u.last_name, u.avatar_path
           FROM messages m JOIN users u ON u.id = m.sender_id
           WHERE m.conversation_id = ?
           ORDER BY m.created_at ASC""",
        (conv_id,)
    )

    # Mark as read
    execute(
        "UPDATE conversation_participants SET last_read_at = datetime('now') WHERE conversation_id = ? AND user_id = ?",
        (conv_id, g.current_user['id'])
    )

    return jsonify({"messages": messages})


@messages_bp.route('/conversations/<int:conv_id>/reply', methods=['POST'])
@login_required
def reply_to_conversation(conv_id):
    participant = query_one(
        "SELECT * FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
        (conv_id, g.current_user['id'])
    )
    if not participant:
        return jsonify({"error": "Not a participant"}), 403

    data = request.get_json()
    if not data or not data.get('body'):
        return jsonify({"error": "Message body required"}), 400

    msg_id = execute(
        "INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)",
        (conv_id, g.current_user['id'], sanitize_html(data['body']))
    )

    execute(
        "UPDATE conversation_participants SET last_read_at = datetime('now') WHERE conversation_id = ? AND user_id = ?",
        (conv_id, g.current_user['id'])
    )

    # Notify other participants
    others = query(
        "SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?",
        (conv_id, g.current_user['id'])
    )
    for o in others:
        execute(
            "INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)",
            (o['user_id'], f"Reply from {g.current_user['first_name']}",
             data['body'][:100], f"#/messages/{conv_id}")
        )

    message = query_one("SELECT * FROM messages WHERE id = ?", (msg_id,))
    return jsonify({"message": message}), 201


@messages_bp.route('/unread-count', methods=['GET'])
@login_required
def unread_count():
    count = query_one(
        """SELECT COUNT(*) as cnt FROM messages m
           JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
           WHERE cp.user_id = ? AND m.sender_id != ?
             AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')""",
        (g.current_user['id'], g.current_user['id'])
    )
    return jsonify({"unread_count": count['cnt']})
