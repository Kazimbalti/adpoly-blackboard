from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from services.file_service import save_file
from services.grade_service import sync_assignment_grade
from utils.db import query, query_one, execute
from utils.validators import validate_required, sanitize_html

projects_bp = Blueprint('projects', __name__)


@projects_bp.route('/course/<int:course_id>', methods=['GET'])
@login_required
def list_projects(course_id):
    user = g.current_user
    if user['role'] in ('faculty', 'admin'):
        projects = query("SELECT * FROM projects WHERE course_id = ? ORDER BY created_at DESC", (course_id,))
    else:
        projects = query("SELECT * FROM projects WHERE course_id = ? AND is_visible = 1 ORDER BY created_at DESC", (course_id,))

    for p in projects:
        p['phases'] = query(
            "SELECT * FROM project_phases WHERE project_id = ? ORDER BY sort_order",
            (p['id'],)
        )
        if user['role'] == 'student':
            for phase in p['phases']:
                subs = query(
                    "SELECT * FROM project_submissions WHERE phase_id = ? AND student_id = ? ORDER BY attempt_number DESC",
                    (phase['id'], user['id'])
                )
                phase['submission'] = subs[0] if subs else None
                phase['attempts_used'] = len(subs)
        elif user['role'] in ('faculty', 'admin'):
            for phase in p['phases']:
                phase['submission_count'] = query_one(
                    "SELECT COUNT(DISTINCT student_id) as cnt FROM project_submissions WHERE phase_id = ?",
                    (phase['id'],)
                )['cnt']
                phase['graded_count'] = query_one(
                    "SELECT COUNT(DISTINCT student_id) as cnt FROM project_submissions WHERE phase_id = ? AND grade IS NOT NULL",
                    (phase['id'],)
                )['cnt']

    return jsonify({"projects": projects})


@projects_bp.route('/course/<int:course_id>', methods=['POST'])
@faculty_required
def create_project(course_id):
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

    p_id = execute(
        """INSERT INTO projects (course_id, title, description, total_points, is_visible)
           VALUES (?, ?, ?, ?, ?)""",
        (course_id, data['title'], sanitize_html(data.get('description', '')),
         data.get('total_points', 100), data.get('is_visible', 1))
    )

    # Create default phases if provided
    phases = data.get('phases', [])
    for i, phase in enumerate(phases):
        execute(
            """INSERT INTO project_phases (project_id, phase_name, description, due_date,
               points, weight, sort_order, submission_type, max_attempts, grade_recording,
               allow_late, late_window_hours, late_penalty_per_day, rubric)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (p_id, phase.get('phase_name', f'Phase {i+1}'),
             sanitize_html(phase.get('description', '')),
             phase.get('due_date'), phase.get('points', 0),
             phase.get('weight', 0), i,
             phase.get('submission_type', 'file'),
             phase.get('max_attempts', 1),
             phase.get('grade_recording', 'last'),
             phase.get('allow_late', 0),
             phase.get('late_window_hours', 0),
             phase.get('late_penalty_per_day', 0),
             sanitize_html(phase.get('rubric', '')))
        )

    # Create grade item
    cat = query_one("SELECT id FROM grade_categories WHERE course_id = ? AND name = 'Assignments'", (course_id,))
    if cat:
        execute(
            """INSERT INTO grade_items (course_id, category_id, title, points_possible, source_type, source_id)
               VALUES (?, ?, ?, ?, 'assignment', ?)""",
            (course_id, cat['id'], data['title'], data.get('total_points', 100), p_id)
        )

    project = query_one("SELECT * FROM projects WHERE id = ?", (p_id,))
    return jsonify({"message": "Project created", "project": project}), 201


@projects_bp.route('/<int:project_id>/phases', methods=['POST'])
@faculty_required
def add_phase(project_id):
    project = query_one("SELECT * FROM projects WHERE id = ?", (project_id,))
    if not project:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    count = query_one("SELECT COUNT(*) as cnt FROM project_phases WHERE project_id = ?", (project_id,))['cnt']

    phase_id = execute(
        """INSERT INTO project_phases (project_id, phase_name, description, due_date,
           points, weight, sort_order, submission_type, max_attempts, grade_recording,
           allow_late, late_window_hours, late_penalty_per_day, rubric)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (project_id, data.get('phase_name', f'Phase {count+1}'),
         sanitize_html(data.get('description', '')),
         data.get('due_date'), data.get('points', 0),
         data.get('weight', 0), count,
         data.get('submission_type', 'file'),
         data.get('max_attempts', 1),
         data.get('grade_recording', 'last'),
         data.get('allow_late', 0),
         data.get('late_window_hours', 0),
         data.get('late_penalty_per_day', 0),
         sanitize_html(data.get('rubric', '')))
    )

    phase = query_one("SELECT * FROM project_phases WHERE id = ?", (phase_id,))
    return jsonify({"message": "Phase added", "phase": phase}), 201


@projects_bp.route('/phases/<int:phase_id>/submit', methods=['POST'])
@login_required
def submit_phase(phase_id):
    phase = query_one("SELECT * FROM project_phases WHERE id = ?", (phase_id,))
    if not phase:
        return jsonify({"error": "Phase not found"}), 404

    user = g.current_user
    attempts = query(
        "SELECT * FROM project_submissions WHERE phase_id = ? AND student_id = ?",
        (phase_id, user['id'])
    )
    max_attempts = phase.get('max_attempts', 1) or 1
    if len(attempts) >= max_attempts:
        return jsonify({"error": f"Maximum attempts ({max_attempts}) reached"}), 409

    content = None
    file_path = None
    file_name = None

    if phase['submission_type'] in ('text', 'both'):
        if request.is_json:
            content = sanitize_html(request.get_json().get('content', ''))
        else:
            content = sanitize_html(request.form.get('content', ''))

    if phase['submission_type'] in ('file', 'both'):
        if 'file' in request.files:
            project = query_one("SELECT * FROM projects WHERE id = ?", (phase['project_id'],))
            file = request.files['file']
            rel_path, orig_name, _, _ = save_file(
                file, subfolder=f"courses/{project['course_id']}/projects"
            )
            file_path = rel_path
            file_name = orig_name

    if not content and not file_path:
        return jsonify({"error": "No content or file provided"}), 400

    # Check deadline
    is_late = 0
    if phase['due_date']:
        from datetime import datetime, timezone, timedelta
        due = datetime.fromisoformat(phase['due_date']).replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if now > due:
            late_window = phase.get('late_window_hours', 0) or 0
            if phase.get('allow_late') or late_window > 0:
                if late_window > 0 and now > due + timedelta(hours=late_window):
                    return jsonify({"error": "Late submission window has closed"}), 400
                is_late = 1
            else:
                return jsonify({"error": "Phase deadline has passed"}), 400

    sub_id = execute(
        """INSERT INTO project_submissions (phase_id, student_id, attempt_number, content,
           file_path, file_name, is_late, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (phase_id, user['id'], len(attempts) + 1, content, file_path, file_name,
         is_late, request.remote_addr, request.headers.get('User-Agent', ''))
    )

    submission = query_one("SELECT * FROM project_submissions WHERE id = ?", (sub_id,))
    return jsonify({"message": "Phase submitted", "submission": submission}), 201


@projects_bp.route('/submissions/<int:submission_id>/grade', methods=['POST'])
@faculty_required
def grade_phase_submission(submission_id):
    submission = query_one("SELECT * FROM project_submissions WHERE id = ?", (submission_id,))
    if not submission:
        return jsonify({"error": "Submission not found"}), 404

    data = request.get_json()
    if not data or 'grade' not in data:
        return jsonify({"error": "Grade required"}), 400

    grade = float(data['grade'])
    feedback = sanitize_html(data.get('feedback', ''))

    execute(
        """UPDATE project_submissions SET grade = ?, feedback = ?, graded_by = ?,
           graded_at = datetime('now'), faculty_confirmed = 1 WHERE id = ?""",
        (grade, feedback, g.current_user['id'], submission_id)
    )

    return jsonify({"message": "Phase graded"})


@projects_bp.route('/phases/<int:phase_id>/submissions', methods=['GET'])
@faculty_required
def get_phase_submissions(phase_id):
    subs = query(
        """SELECT ps.*, u.first_name, u.last_name, u.email
           FROM project_submissions ps JOIN users u ON u.id = ps.student_id
           WHERE ps.phase_id = ? ORDER BY ps.student_id, ps.attempt_number DESC""",
        (phase_id,)
    )
    return jsonify({"submissions": subs})


@projects_bp.route('/<int:project_id>', methods=['DELETE'])
@faculty_required
def delete_project(project_id):
    execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return jsonify({"message": "Project deleted"})
