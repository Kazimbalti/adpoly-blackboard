from flask import Blueprint, request, jsonify, g, send_file
from middleware.auth_middleware import login_required, faculty_required
from services.file_service import save_file, delete_file, get_file_path
from utils.db import query, query_one, execute
from utils.validators import sanitize_html

materials_bp = Blueprint('materials', __name__)


@materials_bp.route('/course/<int:course_id>', methods=['GET'])
@login_required
def list_materials(course_id):
    folders = query(
        "SELECT * FROM material_folders WHERE course_id = ? ORDER BY sort_order, name",
        (course_id,)
    )
    materials = query(
        "SELECT * FROM materials WHERE course_id = ? AND is_visible = 1 ORDER BY sort_order, title",
        (course_id,)
    )
    return jsonify({"folders": folders, "materials": materials})


@materials_bp.route('/course/<int:course_id>/folders', methods=['POST'])
@faculty_required
def create_folder(course_id):
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "Folder name required"}), 400

    folder_id = execute(
        "INSERT INTO material_folders (course_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?)",
        (course_id, data.get('parent_id'), data['name'], data.get('sort_order', 0))
    )
    folder = query_one("SELECT * FROM material_folders WHERE id = ?", (folder_id,))
    return jsonify({"message": "Folder created", "folder": folder}), 201


@materials_bp.route('/course/<int:course_id>/upload', methods=['POST'])
@faculty_required
def upload_material(course_id):
    course = query_one("SELECT * FROM courses WHERE id = ? AND faculty_id = ?",
                       (course_id, g.current_user['id']))
    if not course:
        return jsonify({"error": "Course not found or unauthorized"}), 404

    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    title = request.form.get('title', file.filename)
    description = request.form.get('description', '')
    folder_id = request.form.get('folder_id')

    relative_path, original_name, file_size, mime_type = save_file(
        file, subfolder=f"courses/{course_id}/materials"
    )

    if not relative_path:
        return jsonify({"error": mime_type or "File upload failed"}), 400

    mat_id = execute(
        """INSERT INTO materials (course_id, folder_id, title, description, material_type,
           file_path, file_name, file_size, mime_type) VALUES (?, ?, ?, ?, 'file', ?, ?, ?, ?)""",
        (course_id, folder_id, title, sanitize_html(description),
         relative_path, original_name, file_size, mime_type)
    )

    material = query_one("SELECT * FROM materials WHERE id = ?", (mat_id,))
    return jsonify({"message": "Material uploaded", "material": material}), 201


@materials_bp.route('/course/<int:course_id>/link', methods=['POST'])
@faculty_required
def add_link(course_id):
    data = request.get_json()
    if not data or not data.get('title') or not data.get('url'):
        return jsonify({"error": "Title and URL required"}), 400

    mat_id = execute(
        """INSERT INTO materials (course_id, folder_id, title, description, material_type, url)
           VALUES (?, ?, ?, ?, 'link', ?)""",
        (course_id, data.get('folder_id'), data['title'],
         sanitize_html(data.get('description', '')), data['url'])
    )

    material = query_one("SELECT * FROM materials WHERE id = ?", (mat_id,))
    return jsonify({"message": "Link added", "material": material}), 201


@materials_bp.route('/<int:material_id>/download', methods=['GET'])
@login_required
def download_material(material_id):
    material = query_one("SELECT * FROM materials WHERE id = ?", (material_id,))
    if not material or not material['file_path']:
        return jsonify({"error": "Material not found"}), 404

    file_path = get_file_path(material['file_path'])
    if not file_path:
        return jsonify({"error": "File not found"}), 404

    return send_file(file_path, download_name=material['file_name'], as_attachment=True)


@materials_bp.route('/<int:material_id>', methods=['PUT'])
@faculty_required
def update_material(material_id):
    material = query_one("SELECT * FROM materials WHERE id = ?", (material_id,))
    if not material:
        return jsonify({"error": "Material not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    updates = []
    params = []
    for field in ['title', 'description', 'folder_id', 'sort_order', 'is_visible', 'url']:
        if field in data:
            val = sanitize_html(data[field]) if field == 'description' else data[field]
            updates.append(f"{field} = ?")
            params.append(val)

    if updates:
        updates.append("updated_at = datetime('now')")
        params.append(material_id)
        execute(f"UPDATE materials SET {', '.join(updates)} WHERE id = ?", params)

    material = query_one("SELECT * FROM materials WHERE id = ?", (material_id,))
    return jsonify({"message": "Material updated", "material": material})


@materials_bp.route('/<int:material_id>', methods=['DELETE'])
@faculty_required
def delete_material(material_id):
    material = query_one("SELECT * FROM materials WHERE id = ?", (material_id,))
    if not material:
        return jsonify({"error": "Material not found"}), 404

    if material['file_path']:
        delete_file(material['file_path'])

    execute("DELETE FROM materials WHERE id = ?", (material_id,))
    return jsonify({"message": "Material deleted"})
