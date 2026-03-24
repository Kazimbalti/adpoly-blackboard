from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from services.file_service import save_file
from utils.db import query, query_one, execute
from utils.validators import validate_required, sanitize_html

labs_bp = Blueprint('labs', __name__)


@labs_bp.route('/course/<int:course_id>', methods=['GET'])
@login_required
def list_labs(course_id):
    user = g.current_user
    if user['role'] in ('faculty', 'admin'):
        labs = query("SELECT * FROM labs WHERE course_id = ? ORDER BY lab_date DESC", (course_id,))
    else:
        labs = query("SELECT * FROM labs WHERE course_id = ? AND is_visible = 1 ORDER BY lab_date DESC", (course_id,))

    for lab in labs:
        if user['role'] == 'student':
            subs = query(
                "SELECT * FROM lab_submissions WHERE lab_id = ? AND student_id = ? ORDER BY attempt_number DESC",
                (lab['id'], user['id'])
            )
            lab['submission'] = subs[0] if subs else None
            lab['attempts_used'] = len(subs)
        elif user['role'] in ('faculty', 'admin'):
            lab['submission_count'] = query_one(
                "SELECT COUNT(DISTINCT student_id) as cnt FROM lab_submissions WHERE lab_id = ?",
                (lab['id'],)
            )['cnt']
            lab['graded_count'] = query_one(
                "SELECT COUNT(DISTINCT student_id) as cnt FROM lab_submissions WHERE lab_id = ? AND grade IS NOT NULL",
                (lab['id'],)
            )['cnt']

    return jsonify({"labs": labs})


@labs_bp.route('/course/<int:course_id>', methods=['POST'])
@faculty_required
def create_lab(course_id):
    course = query_one("SELECT * FROM courses WHERE id = ? AND faculty_id = ?",
                       (course_id, g.current_user['id']))
    if not course:
        return jsonify({"error": "Course not found or unauthorized"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    valid, msg = validate_required(data, ['title'])
    if not valid:
        return jsonify({"error": msg}), 400

    lab_id = execute(
        """INSERT INTO labs (course_id, title, description, lab_date, due_date, points,
           submission_type, allow_late, late_window_hours, late_penalty_per_day,
           max_attempts, grade_recording, is_visible, rubric)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (course_id, data['title'], sanitize_html(data.get('description', '')),
         data.get('lab_date'), data.get('due_date'), data.get('points', 100),
         data.get('submission_type', 'file'), data.get('allow_late', 0),
         data.get('late_window_hours', 0), data.get('late_penalty_per_day', 0),
         data.get('max_attempts', 1), data.get('grade_recording', 'last'),
         data.get('is_visible', 1), sanitize_html(data.get('rubric', '')))
    )

    lab = query_one("SELECT * FROM labs WHERE id = ?", (lab_id,))
    return jsonify({"message": "Lab created", "lab": lab}), 201


@labs_bp.route('/<int:lab_id>/submit', methods=['POST'])
@login_required
def submit_lab(lab_id):
    lab = query_one("SELECT * FROM labs WHERE id = ?", (lab_id,))
    if not lab:
        return jsonify({"error": "Lab not found"}), 404

    user = g.current_user
    attempts = query(
        "SELECT * FROM lab_submissions WHERE lab_id = ? AND student_id = ?",
        (lab_id, user['id'])
    )
    max_attempts = lab.get('max_attempts', 1) or 1
    if len(attempts) >= max_attempts:
        return jsonify({"error": f"Maximum attempts ({max_attempts}) reached"}), 409

    content = None
    file_path = None
    file_name = None

    if lab['submission_type'] in ('text', 'both'):
        if request.is_json:
            content = sanitize_html(request.get_json().get('content', ''))
        else:
            content = sanitize_html(request.form.get('content', ''))

    if lab['submission_type'] in ('file', 'both'):
        if 'file' in request.files:
            file = request.files['file']
            rel_path, orig_name, _, _ = save_file(
                file, subfolder=f"courses/{lab['course_id']}/labs"
            )
            file_path = rel_path
            file_name = orig_name

    if not content and not file_path:
        return jsonify({"error": "No content or file provided"}), 400

    is_late = 0
    if lab['due_date']:
        from datetime import datetime, timezone, timedelta
        due = datetime.fromisoformat(lab['due_date']).replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if now > due:
            late_window = lab.get('late_window_hours', 0) or 0
            if lab.get('allow_late') or late_window > 0:
                if late_window > 0 and now > due + timedelta(hours=late_window):
                    return jsonify({"error": "Late submission window has closed"}), 400
                is_late = 1
            else:
                return jsonify({"error": "Lab deadline has passed"}), 400

    sub_id = execute(
        """INSERT INTO lab_submissions (lab_id, student_id, attempt_number, content,
           file_path, file_name, is_late, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (lab_id, user['id'], len(attempts) + 1, content, file_path, file_name,
         is_late, request.remote_addr, request.headers.get('User-Agent', ''))
    )

    submission = query_one("SELECT * FROM lab_submissions WHERE id = ?", (sub_id,))
    return jsonify({"message": "Lab report submitted", "submission": submission}), 201


@labs_bp.route('/<int:lab_id>/submissions', methods=['GET'])
@faculty_required
def get_lab_submissions(lab_id):
    subs = query(
        """SELECT ls.*, u.first_name, u.last_name, u.email
           FROM lab_submissions ls JOIN users u ON u.id = ls.student_id
           WHERE ls.lab_id = ? ORDER BY ls.student_id, ls.attempt_number DESC""",
        (lab_id,)
    )
    return jsonify({"submissions": subs})


@labs_bp.route('/submissions/<int:submission_id>/grade', methods=['POST'])
@faculty_required
def grade_lab_submission(submission_id):
    submission = query_one("SELECT * FROM lab_submissions WHERE id = ?", (submission_id,))
    if not submission:
        return jsonify({"error": "Submission not found"}), 404

    data = request.get_json()
    if not data or 'grade' not in data:
        return jsonify({"error": "Grade required"}), 400

    execute(
        "UPDATE lab_submissions SET grade = ?, feedback = ?, graded_by = ?, graded_at = datetime('now') WHERE id = ?",
        (float(data['grade']), sanitize_html(data.get('feedback', '')),
         g.current_user['id'], submission_id)
    )

    return jsonify({"message": "Lab graded"})


@labs_bp.route('/<int:lab_id>', methods=['DELETE'])
@faculty_required
def delete_lab(lab_id):
    execute("DELETE FROM labs WHERE id = ?", (lab_id,))
    return jsonify({"message": "Lab deleted"})
