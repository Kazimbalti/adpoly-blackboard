import os
import uuid
import mimetypes
from flask import current_app
from utils.validators import sanitize_filename


def allowed_file(filename):
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in current_app.config['ALLOWED_EXTENSIONS']


def save_file(file, subfolder='general'):
    if not file or not file.filename:
        return None, None, None, None

    original_name = sanitize_filename(file.filename)
    if not allowed_file(original_name):
        return None, None, None, "File type not allowed"

    ext = original_name.rsplit('.', 1)[1].lower()
    unique_name = f"{uuid.uuid4().hex}.{ext}"

    upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], subfolder)
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, unique_name)
    file.save(file_path)

    file_size = os.path.getsize(file_path)
    mime_type = mimetypes.guess_type(original_name)[0] or 'application/octet-stream'

    relative_path = f"uploads/{subfolder}/{unique_name}"
    return relative_path, original_name, file_size, mime_type


def delete_file(relative_path):
    if not relative_path:
        return
    full_path = os.path.join(current_app.static_folder, relative_path)
    if os.path.exists(full_path):
        os.remove(full_path)


def get_file_path(relative_path):
    if not relative_path:
        return None
    return os.path.join(current_app.static_folder, relative_path)
