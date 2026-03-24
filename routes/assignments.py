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

    if user['role'] in ('faculty', 'admin'):
        assignments = query(
            "SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date",
            (course_id,)
        )
    else:
        assignments = query(
            "SELECT * FROM assignments WHERE course_id = ? AND is_visible = 1 ORDER BY due_date",
            (course_id,)
        )

    if user['role'] == 'student':
        for a in assignments:
            subs = query(
                """SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?
                   ORDER BY attempt_number DESC""",
                (a['id'], user['id'])
            )
            a['submissions'] = subs
            a['submission'] = subs[0] if subs else None
            a['attempts_used'] = len(subs)

    if user['role'] in ('faculty', 'admin'):
        for a in assignments:
            a['submission_count'] = query_one(
                "SELECT COUNT(DISTINCT student_id) as cnt FROM submissions WHERE assignment_id = ?",
                (a['id'],)
            )['cnt']
            a['graded_count'] = query_one(
                "SELECT COUNT(DISTINCT student_id) as cnt FROM submissions WHERE assignment_id = ? AND grade IS NOT NULL",
                (a['id'],)
            )['cnt']
            a['needs_grading'] = a['submission_count'] - a['graded_count']

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
        """INSERT INTO assignments (course_id, title, description, due_date, available_from,
           points, assignment_type, allow_late, late_penalty, late_window_hours,
           late_penalty_per_day, max_attempts, grade_recording, rubric, is_visible)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (course_id, data['title'], sanitize_html(data.get('description', '')),
         data.get('due_date'), data.get('available_from'),
         data.get('points', 100),
         data.get('assignment_type', 'file'), data.get('allow_late', 0),
         data.get('late_penalty', 0), data.get('late_window_hours', 0),
         data.get('late_penalty_per_day', 0),
         data.get('max_attempts', 1), data.get('grade_recording', 'last'),
         sanitize_html(data.get('rubric', '')),
         data.get('is_visible', 1))
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
        subs = query(
            """SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?
               ORDER BY attempt_number DESC""",
            (assignment_id, user['id'])
        )
        assignment['submissions'] = subs
        assignment['submission'] = subs[0] if subs else None
        assignment['attempts_used'] = len(subs)
    elif user['role'] in ('faculty', 'admin'):
        # Get latest submission per student
        assignment['submissions'] = query(
            """SELECT s.*, u.first_name, u.last_name, u.email
               FROM submissions s JOIN users u ON u.id = s.student_id
               WHERE s.assignment_id = ?
               ORDER BY s.student_id, s.attempt_number DESC""",
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
    for field in ['title', 'description', 'due_date', 'available_from', 'points',
                  'assignment_type', 'allow_late', 'late_penalty', 'late_window_hours',
                  'late_penalty_per_day', 'max_attempts', 'grade_recording',
                  'rubric', 'is_visible']:
        if field in data:
            val = sanitize_html(data[field]) if field in ('description', 'rubric') else data[field]
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

    # Count existing attempts
    attempts = query(
        "SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY attempt_number",
        (assignment_id, user['id'])
    )
    attempt_count = len(attempts)
    max_attempts = assignment.get('max_attempts', 1) or 1

    if attempt_count >= max_attempts:
        return jsonify({"error": f"Maximum attempts ({max_attempts}) reached. Contact instructor to resubmit."}), 409

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

    # Check deadline
    is_late = 0
    if assignment['due_date']:
        from datetime import datetime, timezone, timedelta
        due = datetime.fromisoformat(assignment['due_date'])
        now = datetime.now(timezone.utc)
        due_utc = due.replace(tzinfo=timezone.utc)

        if now > due_utc:
            late_window = assignment.get('late_window_hours', 0) or 0
            allow_late = assignment.get('allow_late', 0)

            if not allow_late and late_window == 0:
                return jsonify({"error": "Assignment is past due. Submissions are locked."}), 400

            # Check late window
            if late_window > 0:
                late_deadline = due_utc + timedelta(hours=late_window)
                if now > late_deadline:
                    return jsonify({"error": f"Late submission window has also closed ({late_window}h after deadline)."}), 400

            if not allow_late and late_window == 0:
                return jsonify({"error": "Assignment is past due"}), 400

            is_late = 1

    attempt_number = attempt_count + 1
    sub_id = execute(
        """INSERT INTO submissions (assignment_id, student_id, content, file_path, file_name,
           is_late, attempt_number, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (assignment_id, user['id'], content, file_path, file_name, is_late,
         attempt_number, request.remote_addr, request.headers.get('User-Agent', ''))
    )

    # Notify faculty of resubmission
    if attempt_number > 1:
        course = query_one("SELECT * FROM courses WHERE id = ?", (assignment['course_id'],))
        if course:
            execute(
                "INSERT INTO notifications (user_id, title, body, link, notif_type) VALUES (?, ?, ?, ?, ?)",
                (course['faculty_id'],
                 f"Resubmission: {assignment['title']}",
                 f"{user['first_name']} {user['last_name']} submitted attempt #{attempt_number}",
                 f"#/courses/{assignment['course_id']}",
                 'resubmission')
            )

    submission = query_one("SELECT * FROM submissions WHERE id = ?", (sub_id,))
    return jsonify({"message": "Assignment submitted", "submission": submission}), 201


@assignments_bp.route('/<int:assignment_id>/attempts/<int:student_id>', methods=['GET'])
@login_required
def get_student_attempts(assignment_id, student_id):
    """Get all submission attempts for a student"""
    user = g.current_user
    if user['role'] == 'student' and user['id'] != student_id:
        return jsonify({"error": "Unauthorized"}), 403

    attempts = query(
        """SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?
           ORDER BY attempt_number""",
        (assignment_id, student_id)
    )
    assignment = query_one("SELECT * FROM assignments WHERE id = ?", (assignment_id,))

    return jsonify({
        "attempts": attempts,
        "max_attempts": assignment.get('max_attempts', 1) if assignment else 1,
        "grade_recording": assignment.get('grade_recording', 'last') if assignment else 'last'
    })


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

    # Apply late penalty
    assignment = query_one("SELECT * FROM assignments WHERE id = ?", (submission['assignment_id'],))
    if submission['is_late'] and assignment:
        penalty_per_day = assignment.get('late_penalty_per_day', 0) or assignment.get('late_penalty', 0) or 0
        if penalty_per_day > 0 and assignment['due_date']:
            from datetime import datetime, timezone
            due = datetime.fromisoformat(assignment['due_date']).replace(tzinfo=timezone.utc)
            submitted = datetime.fromisoformat(submission['submitted_at']).replace(tzinfo=timezone.utc)
            days_late = max(1, int((submitted - due).total_seconds() / 86400) + 1)
            penalty = min(grade, penalty_per_day * days_late)
            grade = max(0, grade - penalty)
            feedback = f"[Late penalty: -{penalty} ({days_late} day(s) late)] " + feedback

    execute(
        """UPDATE submissions SET grade = ?, feedback = ?, graded_by = ?,
           graded_at = datetime('now'), faculty_confirmed = 1 WHERE id = ?""",
        (grade, feedback, g.current_user['id'], submission_id)
    )

    # Calculate final grade based on recording rule
    final_grade = _calculate_assignment_grade(
        submission['assignment_id'], submission['student_id']
    )
    if final_grade is not None:
        sync_assignment_grade(submission['assignment_id'], submission['student_id'], final_grade)

    # Notify student
    course = query_one("SELECT * FROM courses WHERE id = ?", (assignment['course_id'],))
    execute(
        "INSERT INTO notifications (user_id, title, body, link, notif_type) VALUES (?, ?, ?, ?, ?)",
        (submission['student_id'], f"Grade posted for {assignment['title']}",
         f"You received {grade}/{assignment['points']} in {course['code']}",
         f"#/courses/{course['id']}", 'grade_posted')
    )

    return jsonify({"message": "Submission graded"})


def _calculate_assignment_grade(assignment_id, student_id):
    """Calculate final grade based on grade_recording rule"""
    assignment = query_one("SELECT * FROM assignments WHERE id = ?", (assignment_id,))
    if not assignment:
        return None

    subs = query(
        """SELECT grade FROM submissions
           WHERE assignment_id = ? AND student_id = ? AND grade IS NOT NULL
           ORDER BY attempt_number""",
        (assignment_id, student_id)
    )
    if not subs:
        return None

    grades = [s['grade'] for s in subs]
    rule = assignment.get('grade_recording', 'last')

    if rule == 'best':
        return max(grades)
    elif rule == 'last':
        return grades[-1]
    elif rule == 'average':
        return round(sum(grades) / len(grades), 2)
    return grades[-1]
