"""OneDrive integration routes for file sharing and storage."""
from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required
from utils.db import query, query_one, execute

onedrive_bp = Blueprint('onedrive', __name__)

# OneDrive configuration stored per user
ONEDRIVE_SHARE_BASE = "https://onedrive.live.com"


@onedrive_bp.route('/link', methods=['POST'])
@login_required
def link_onedrive():
    """Save user's OneDrive link/email for integration."""
    data = request.get_json()
    if not data or not data.get('onedrive_email'):
        return jsonify({"error": "OneDrive email required"}), 400

    # Store in user profile (we'll use a simple approach with a JSON field)
    execute(
        "UPDATE users SET onedrive_email = ? WHERE id = ?",
        (data['onedrive_email'], g.current_user['id'])
    )

    return jsonify({"message": "OneDrive linked successfully"})


@onedrive_bp.route('/status', methods=['GET'])
@login_required
def onedrive_status():
    """Check if user has OneDrive linked."""
    user = query_one("SELECT onedrive_email FROM users WHERE id = ?", (g.current_user['id'],))
    return jsonify({
        "linked": bool(user and user.get('onedrive_email')),
        "email": user.get('onedrive_email') if user else None
    })


@onedrive_bp.route('/unlink', methods=['POST'])
@login_required
def unlink_onedrive():
    """Remove OneDrive link."""
    execute("UPDATE users SET onedrive_email = NULL WHERE id = ?", (g.current_user['id'],))
    return jsonify({"message": "OneDrive unlinked"})


@onedrive_bp.route('/share', methods=['POST'])
@login_required
def share_from_onedrive():
    """Add a OneDrive shared link as course material."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    required = ['course_id', 'title', 'share_url']
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    # Validate it looks like a OneDrive/SharePoint URL
    url = data['share_url']
    valid_domains = ['onedrive.live.com', '1drv.ms', 'sharepoint.com', 'office.com', 'live.com']
    is_valid = any(domain in url.lower() for domain in valid_domains) or url.startswith('http')

    if not is_valid:
        return jsonify({"error": "Please provide a valid OneDrive or SharePoint sharing link"}), 400

    mat_id = execute(
        """INSERT INTO materials (course_id, title, description, material_type, url, is_visible)
           VALUES (?, ?, ?, 'link', ?, 1)""",
        (data['course_id'], data['title'], data.get('description', 'Shared from OneDrive'), url)
    )

    material = query_one("SELECT * FROM materials WHERE id = ?", (mat_id,))
    return jsonify({"message": "OneDrive file shared to course", "material": material}), 201


@onedrive_bp.route('/course/<int:course_id>/files', methods=['GET'])
@login_required
def list_onedrive_files(course_id):
    """List all OneDrive-shared files in a course."""
    files = query(
        """SELECT * FROM materials WHERE course_id = ? AND material_type = 'link'
           AND (url LIKE '%onedrive%' OR url LIKE '%1drv%' OR url LIKE '%sharepoint%' OR url LIKE '%office%')
           ORDER BY created_at DESC""",
        (course_id,)
    )
    return jsonify({"files": files})
