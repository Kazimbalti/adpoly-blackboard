from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from services.file_service import save_file
from services.grade_service import sync_assignment_grade
from utils.db import query, query_one, execute
from utils.validators import validate_required, sanitize_html

assignments_bp = Blueprint('assignments', __name__)


@assignments_bp.route('/course/<int:course_id>', methods=['GET'])
@login_required
def list_assignments(course_id):
    user = g.current_user
    assignments = query(
        "SELECT * FROM assignments WHERE course_id = ? AND is_visible = 1 ORDER BY due_date",
        (course_id,)
    )

    if user['role'] == 'student':
        for a in assignments:
            sub = query_one(
                "SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?",
                (a['id'], user['id'])
            )
            a['submission'] = sub

    if user['role'] in ('faculty', 'admin'):
        for a in assignments:
            a['submission_count'] = query_one(
                "SELECT COUNT(*) as cnt FROM submissions WHERE assignment_id = ?",
                (a['id'],)
            )['cnt']
            a['graded_count'] = query_one(
                "SELECT COUNT(*) as cnt FROM submissions WHERE assignment_id = ? AND grade IS NOT NULL",
                (a['id'],)
            )['cnt']

    return jsonify({"assignments": assignments})


@assignments_bp.route('/course/<int:course_id>', methods=['POST'])
@faculty_required
def create_assignment(course_id):
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

    a_id = execute(
        """INSERT INTO assignments (course_id, title, description, due_date, points,
           assignment_type, allow_late, late_penalty, is_visible)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (course_id, data['title'], sanitize_html(data.get('description', '')),
         data.get('due_date'), data.get('points', 100),
         data.get('assignment_type', 'file'), data.get('allow_late', 0),
         data.get('late_penalty', 0), data.get('is_visible', 1))
    )

    # Create grade item
    cat = query_one(
        "SELECT id FROM grade_categories WHERE course_id = ? AND name = 'Assignments'",
        (course_id,)
    )
    if cat:
        execute(
            """INSERT INTO grade_items (course_id, category_id, title, points_possible, source_type, source_id)
               VALUES (?, ?, ?, ?, 'assignment', ?)""",
            (course_id, cat['id'], data['title'], data.get('points', 100), a_id)
        )

    assignment = query_one("SELECT * FROM assignments WHERE id = ?", (a_id,))
    return jsonify({"message": "Assignment created", "assignment": assignment}), 201


@assignments_bp.route('/<int:assignment_id>', methods=['GET'])
@login_required
def get_assignment(assignment_id):
    assignment = query_one("SELECT * FROM assignments WHERE id = ?", (assignment_id,))
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    user = g.current_user
    if user['role'] == 'student':
        assignment['submission'] = query_one(
            "SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?",
            (assignment_id, user['id'])
        )
    elif user['role'] in ('faculty', 'admin'):
        assignment['submissions'] = query(
            """SELECT s.*, u.first_name, u.last_name, u.email
               FROM submissions s JOIN users u ON u.id = s.student_id
               WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC""",
            (assignment_id,)
        )

    return jsonify({"assignment": assignment})


@assignments_bp.route('/<int:assignment_id>', methods=['PUT'])
@faculty_required
def update_assignment(assignment_id):
    assignment = query_one("SELECT * FROM assignments WHERE id = ?", (assignment_id,))
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    updates = []
    params = []
    for field in ['title', 'description', 'due_date', 'points', 'assignment_type',
                  'allow_late', 'late_penalty', 'is_visible']:
        if field in data:
            val = sanitize_html(data[field]) if field == 'description' else data[field]
            updates.append(f"{field} = ?")
            params.append(val)

    if updates:
        updates.append("updated_at = datetime('now')")
        params.append(assignment_id)
        execute(f"UPDATE assignments SET {', '.join(updates)} WHERE id = ?", params)

    assignment = query_one("SELECT * FROM assignments WHERE id = ?", (assignment_id,))
    return jsonify({"message": "Assignment updated", "assignment": assignment})


@assignments_bp.route('/<int:assignment_id>/submit', methods=['POST'])
@login_required
def submit_assignment(assignment_id):
    assignment = query_one("SELECT * FROM assignments WHERE id = ?", (assignment_id,))
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    user = g.current_user
    existing = query_one(
        "SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?",
        (assignment_id, user['id'])
    )
    if existing:
        return jsonify({"error": "Already submitted. Contact instructor to resubmit."}), 409

    content = None
    file_path = None
    file_name = None

    if assignment['assignment_type'] in ('text', 'both'):
        if request.is_json:
            content = sanitize_html(request.get_json().get('content', ''))
        else:
            content = sanitize_html(request.form.get('content', ''))

    if assignment['assignment_type'] in ('file', 'both'):
        if 'file' in request.files:
            file = request.files['file']
            rel_path, orig_name, _, _ = save_file(
                file, subfolder=f"courses/{assignment['course_id']}/submissions"
            )
            file_path = rel_path
            file_name = orig_name

    if not content and not file_path:
        return jsonify({"error": "No content or file provided"}), 400

    is_late = 0
    if assignment['due_date']:
        from datetime import datetime, timezone
        due = datetime.fromisoformat(assignment['due_date'])
        if datetime.now(timezone.utc) > due.replace(tzinfo=timezone.utc):
            if not assignment['allow_late']:
                return jsonify({"error": "Assignment is past due"}), 400
            is_late = 1

    sub_id = execute(
        """INSERT INTO submissions (assignment_id, student_id, content, file_path, file_name, is_late)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (assignment_id, user['id'], content, file_path, file_name, is_late)
    )

    submission = query_one("SELECT * FROM submissions WHERE id = ?", (sub_id,))
    return jsonify({"message": "Assignment submitted", "submission": submission}), 201


@assignments_bp.route('/submissions/<int:submission_id>/grade', methods=['POST'])
@faculty_required
def grade_submission(submission_id):
    submission = query_one("SELECT * FROM submissions WHERE id = ?", (submission_id,))
    if not submission:
        return jsonify({"error": "Submission not found"}), 404

    data = request.get_json()
    if not data or 'grade' not in data:
        return jsonify({"error": "Grade required"}), 400

    grade = float(data['grade'])
    feedback = sanitize_html(data.get('feedback', ''))

    execute(
        """UPDATE submissions SET grade = ?, feedback = ?, graded_by = ?, graded_at = datetime('now')
           WHERE id = ?""",
        (grade, feedback, g.current_user['id'], submission_id)
    )

    # Sync to gradebook
    sync_assignment_grade(submission['assignment_id'], submission['student_id'], grade)

    # Notify student
    assignment = query_one("SELECT * FROM assignments WHERE id = ?", (submission['assignment_id'],))
    course = query_one("SELECT * FROM courses WHERE id = ?", (assignment['course_id'],))
    execute(
        "INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)",
        (submission['student_id'], f"Grade posted for {assignment['title']}",
         f"You received {grade}/{assignment['points']} in {course['code']}",
         f"#/courses/{course['id']}/assignments/{assignment['id']}")
    )

    return jsonify({"message": "Submission graded"})
