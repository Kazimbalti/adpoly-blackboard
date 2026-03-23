from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from utils.db import query, query_one, execute
from utils.validators import validate_required, sanitize_html

courses_bp = Blueprint('courses', __name__)


@courses_bp.route('/', methods=['GET'])
@login_required
def list_courses():
    user = g.current_user
    if user['role'] == 'faculty':
        courses = query(
            "SELECT * FROM courses WHERE faculty_id = ? ORDER BY updated_at DESC",
            (user['id'],)
        )
    elif user['role'] == 'admin':
        courses = query("SELECT * FROM courses ORDER BY updated_at DESC")
    else:
        courses = query(
            """SELECT c.*, e.status as enrollment_status, e.enrolled_at,
                      u.first_name as faculty_first, u.last_name as faculty_last
               FROM courses c
               JOIN enrollments e ON e.course_id = c.id
               JOIN users u ON u.id = c.faculty_id
               WHERE e.student_id = ? AND e.status = 'active'
               ORDER BY c.title""",
            (user['id'],)
        )

    for c in courses:
        c['enrollment_count'] = query_one(
            "SELECT COUNT(*) as cnt FROM enrollments WHERE course_id = ? AND status = 'active'",
            (c['id'],)
        )['cnt']

    return jsonify({"courses": courses})


@courses_bp.route('/', methods=['POST'])
@faculty_required
def create_course():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    valid, msg = validate_required(data, ['code', 'title'])
    if not valid:
        return jsonify({"error": msg}), 400

    existing = query_one("SELECT id FROM courses WHERE code = ?", (data['code'],))
    if existing:
        return jsonify({"error": "Course code already exists"}), 409

    course_id = execute(
        """INSERT INTO courses (code, title, description, faculty_id, semester, max_students, color)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (data['code'], data['title'], sanitize_html(data.get('description', '')),
         g.current_user['id'], data.get('semester', ''),
         data.get('max_students', 50), data.get('color', '#4A90D9'))
    )

    # Create default grade categories
    categories = [
        ('Assignments', 40, 1),
        ('Exams', 40, 2),
        ('Participation', 20, 3)
    ]
    for name, weight, order in categories:
        execute(
            "INSERT INTO grade_categories (course_id, name, weight, sort_order) VALUES (?, ?, ?, ?)",
            (course_id, name, weight, order)
        )

    course = query_one("SELECT * FROM courses WHERE id = ?", (course_id,))
    return jsonify({"message": "Course created", "course": course}), 201


@courses_bp.route('/<int:course_id>', methods=['GET'])
@login_required
def get_course(course_id):
    course = query_one("SELECT * FROM courses WHERE id = ?", (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404

    user = g.current_user
    if user['role'] == 'student':
        enrolled = query_one(
            "SELECT * FROM enrollments WHERE course_id = ? AND student_id = ? AND status = 'active'",
            (course_id, user['id'])
        )
        if not enrolled:
            return jsonify({"error": "Not enrolled in this course"}), 403

    faculty = query_one(
        "SELECT id, first_name, last_name, email FROM users WHERE id = ?",
        (course['faculty_id'],)
    )
    course['faculty'] = faculty

    course['enrollment_count'] = query_one(
        "SELECT COUNT(*) as cnt FROM enrollments WHERE course_id = ? AND status = 'active'",
        (course_id,)
    )['cnt']

    course['announcements'] = query(
        """SELECT an.*, u.first_name, u.last_name FROM announcements an
           JOIN users u ON u.id = an.author_id
           WHERE an.course_id = ? ORDER BY an.is_pinned DESC, an.created_at DESC LIMIT 5""",
        (course_id,)
    )

    course['assignments'] = query(
        "SELECT * FROM assignments WHERE course_id = ? AND is_visible = 1 ORDER BY due_date",
        (course_id,)
    )

    course['exams'] = query(
        "SELECT * FROM exams WHERE course_id = ? AND is_published = 1 ORDER BY start_window",
        (course_id,)
    )

    return jsonify({"course": course})


@courses_bp.route('/<int:course_id>', methods=['PUT'])
@faculty_required
def update_course(course_id):
    course = query_one("SELECT * FROM courses WHERE id = ? AND faculty_id = ?",
                       (course_id, g.current_user['id']))
    if not course:
        return jsonify({"error": "Course not found or unauthorized"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    updates = []
    params = []
    for field in ['title', 'description', 'semester', 'max_students', 'is_published', 'color']:
        if field in data:
            val = sanitize_html(data[field]) if field == 'description' else data[field]
            updates.append(f"{field} = ?")
            params.append(val)

    if updates:
        updates.append("updated_at = datetime('now')")
        params.append(course_id)
        execute(f"UPDATE courses SET {', '.join(updates)} WHERE id = ?", params)

    course = query_one("SELECT * FROM courses WHERE id = ?", (course_id,))
    return jsonify({"message": "Course updated", "course": course})


@courses_bp.route('/<int:course_id>', methods=['DELETE'])
@faculty_required
def delete_course(course_id):
    course = query_one("SELECT * FROM courses WHERE id = ? AND faculty_id = ?",
                       (course_id, g.current_user['id']))
    if not course:
        return jsonify({"error": "Course not found or unauthorized"}), 404

    execute("DELETE FROM courses WHERE id = ?", (course_id,))
    return jsonify({"message": "Course deleted"})


@courses_bp.route('/<int:course_id>/enroll', methods=['POST'])
@login_required
def enroll_student(course_id):
    user = g.current_user
    # Faculty can enroll in any course, students only in published
    if user['role'] in ('faculty', 'admin'):
        course = query_one("SELECT * FROM courses WHERE id = ?", (course_id,))
    else:
        course = query_one("SELECT * FROM courses WHERE id = ? AND is_published = 1", (course_id,))
    if not course:
        return jsonify({"error": "Course not found or not published"}), 404

    if user['role'] in ('faculty', 'admin'):
        # Faculty enrolling a student by ID or email
        data = request.get_json() or {}
        student_id = data.get('student_id')
        student_email = data.get('student_email')

        if not student_id and student_email:
            student = query_one("SELECT id FROM users WHERE email = ? AND role = 'student'", (student_email,))
            if not student:
                return jsonify({"error": f"No student found with email: {student_email}"}), 404
            student_id = student['id']

        if not student_id:
            return jsonify({"error": "student_id or student_email required"}), 400
    else:
        student_id = user['id']

    existing = query_one(
        "SELECT * FROM enrollments WHERE course_id = ? AND student_id = ?",
        (course_id, student_id)
    )
    if existing:
        if existing['status'] == 'active':
            return jsonify({"error": "Already enrolled"}), 409
        execute(
            "UPDATE enrollments SET status = 'active' WHERE id = ?",
            (existing['id'],)
        )
        return jsonify({"message": "Re-enrolled successfully"})

    count = query_one(
        "SELECT COUNT(*) as cnt FROM enrollments WHERE course_id = ? AND status = 'active'",
        (course_id,)
    )['cnt']
    if count >= course['max_students']:
        return jsonify({"error": "Course is full"}), 400

    execute(
        "INSERT INTO enrollments (course_id, student_id) VALUES (?, ?)",
        (course_id, student_id)
    )
    return jsonify({"message": "Enrolled successfully"}), 201


@courses_bp.route('/<int:course_id>/unenroll', methods=['POST'])
@login_required
def unenroll_student(course_id):
    user = g.current_user
    if user['role'] == 'faculty':
        data = request.get_json()
        student_id = data.get('student_id') if data else None
        if not student_id:
            return jsonify({"error": "student_id required"}), 400
    else:
        student_id = user['id']

    execute(
        "UPDATE enrollments SET status = 'dropped' WHERE course_id = ? AND student_id = ?",
        (course_id, student_id)
    )
    return jsonify({"message": "Unenrolled successfully"})


@courses_bp.route('/<int:course_id>/students', methods=['GET'])
@login_required
def list_students(course_id):
    course = query_one("SELECT * FROM courses WHERE id = ?", (course_id,))
    if not course:
        return jsonify({"error": "Course not found"}), 404

    students = query(
        """SELECT u.id, u.email, u.first_name, u.last_name, e.status, e.enrolled_at
           FROM users u
           JOIN enrollments e ON e.student_id = u.id
           WHERE e.course_id = ?
           ORDER BY u.last_name, u.first_name""",
        (course_id,)
    )
    return jsonify({"students": students})


@courses_bp.route('/<int:course_id>/announcements', methods=['POST'])
@faculty_required
def create_announcement(course_id):
    course = query_one("SELECT * FROM courses WHERE id = ? AND faculty_id = ?",
                       (course_id, g.current_user['id']))
    if not course:
        return jsonify({"error": "Course not found or unauthorized"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    valid, msg = validate_required(data, ['title', 'body'])
    if not valid:
        return jsonify({"error": msg}), 400

    ann_id = execute(
        "INSERT INTO announcements (course_id, author_id, title, body, is_pinned) VALUES (?, ?, ?, ?, ?)",
        (course_id, g.current_user['id'], data['title'],
         sanitize_html(data['body']), data.get('is_pinned', 0))
    )

    # Notify enrolled students
    students = query(
        "SELECT student_id FROM enrollments WHERE course_id = ? AND status = 'active'",
        (course_id,)
    )
    for s in students:
        execute(
            "INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)",
            (s['student_id'], f"New announcement in {course['code']}",
             data['title'], f"#/courses/{course_id}")
        )

    announcement = query_one("SELECT * FROM announcements WHERE id = ?", (ann_id,))
    return jsonify({"message": "Announcement posted", "announcement": announcement}), 201


@courses_bp.route('/available', methods=['GET'])
@login_required
def list_available_courses():
    user = g.current_user
    courses = query(
        """SELECT c.*, u.first_name as faculty_first, u.last_name as faculty_last,
                  (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id AND status = 'active') as enrollment_count
           FROM courses c
           JOIN users u ON u.id = c.faculty_id
           WHERE c.is_published = 1
             AND c.id NOT IN (SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'active')
           ORDER BY c.title""",
        (user['id'],)
    )
    return jsonify({"courses": courses})
