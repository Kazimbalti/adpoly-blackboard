from flask import Blueprint, jsonify, g
from middleware.auth_middleware import login_required
from utils.db import query, query_one

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/', methods=['GET'])
@login_required
def get_dashboard():
    user = g.current_user
    if user['role'] == 'faculty':
        return get_faculty_dashboard(user['id'])
    return get_student_dashboard(user['id'])


def get_faculty_dashboard(user_id):
    courses = query(
        "SELECT * FROM courses WHERE faculty_id = ? ORDER BY updated_at DESC",
        (user_id,)
    )

    for course in courses:
        course['enrollment_count'] = query_one(
            "SELECT COUNT(*) as cnt FROM enrollments WHERE course_id = ? AND status = 'active'",
            (course['id'],)
        )['cnt']

    recent_submissions = query(
        """SELECT s.*, a.title as assignment_title, a.course_id,
                  u.first_name, u.last_name, c.code as course_code
           FROM submissions s
           JOIN assignments a ON a.id = s.assignment_id
           JOIN users u ON u.id = s.student_id
           JOIN courses c ON c.id = a.course_id
           WHERE c.faculty_id = ? AND s.grade IS NULL
           ORDER BY s.submitted_at DESC LIMIT 10""",
        (user_id,)
    )

    announcements = query(
        """SELECT an.*, c.code as course_code FROM announcements an
           JOIN courses c ON c.id = an.course_id
           WHERE an.author_id = ?
           ORDER BY an.created_at DESC LIMIT 5""",
        (user_id,)
    )

    total_students = query_one(
        """SELECT COUNT(DISTINCT e.student_id) as cnt FROM enrollments e
           JOIN courses c ON c.id = e.course_id
           WHERE c.faculty_id = ? AND e.status = 'active'""",
        (user_id,)
    )['cnt']

    pending_grades = query_one(
        """SELECT COUNT(*) as cnt FROM submissions s
           JOIN assignments a ON a.id = s.assignment_id
           JOIN courses c ON c.id = a.course_id
           WHERE c.faculty_id = ? AND s.grade IS NULL""",
        (user_id,)
    )['cnt']

    return jsonify({
        "role": "faculty",
        "courses": courses,
        "recent_submissions": recent_submissions,
        "announcements": announcements,
        "stats": {
            "total_courses": len(courses),
            "total_students": total_students,
            "pending_grades": pending_grades
        }
    })


def get_student_dashboard(user_id):
    courses = query(
        """SELECT c.*, u.first_name as faculty_first, u.last_name as faculty_last
           FROM courses c
           JOIN enrollments e ON e.course_id = c.id
           JOIN users u ON u.id = c.faculty_id
           WHERE e.student_id = ? AND e.status = 'active'
           ORDER BY c.title""",
        (user_id,)
    )

    upcoming_assignments = query(
        """SELECT a.*, c.code as course_code, c.color,
                  s.id as submission_id, s.submitted_at, s.grade
           FROM assignments a
           JOIN courses c ON c.id = a.course_id
           JOIN enrollments e ON e.course_id = c.id
           LEFT JOIN (
               SELECT assignment_id, student_id, id, submitted_at, grade
               FROM submissions WHERE student_id = ?
               GROUP BY assignment_id HAVING attempt_number = MAX(attempt_number)
           ) s ON s.assignment_id = a.id
           WHERE e.student_id = ? AND e.status = 'active'
             AND a.is_visible = 1
             AND (a.due_date IS NULL OR a.due_date >= datetime('now'))
           ORDER BY a.due_date ASC LIMIT 10""",
        (user_id, user_id)
    )

    upcoming_exams = query(
        """SELECT ex.*, c.code as course_code, c.color
           FROM exams ex
           JOIN courses c ON c.id = ex.course_id
           JOIN enrollments e ON e.course_id = c.id
           WHERE e.student_id = ? AND e.status = 'active'
             AND ex.is_published = 1
             AND (ex.end_window IS NULL OR ex.end_window >= datetime('now'))
           ORDER BY ex.start_window ASC LIMIT 5""",
        (user_id,)
    )

    recent_grades = query(
        """SELECT g.*, gi.title, gi.points_possible, c.code as course_code
           FROM grades g
           JOIN grade_items gi ON gi.id = g.grade_item_id
           JOIN courses c ON c.id = gi.course_id
           WHERE g.student_id = ?
           ORDER BY g.updated_at DESC LIMIT 10""",
        (user_id,)
    )

    announcements = query(
        """SELECT an.*, c.code as course_code, c.color,
                  u.first_name as author_first, u.last_name as author_last
           FROM announcements an
           JOIN courses c ON c.id = an.course_id
           JOIN enrollments e ON e.course_id = c.id
           JOIN users u ON u.id = an.author_id
           WHERE e.student_id = ? AND e.status = 'active'
           ORDER BY an.created_at DESC LIMIT 10""",
        (user_id,)
    )

    notifications = query(
        "SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 20",
        (user_id,)
    )

    return jsonify({
        "role": "student",
        "courses": courses,
        "upcoming_assignments": upcoming_assignments,
        "upcoming_exams": upcoming_exams,
        "recent_grades": recent_grades,
        "announcements": announcements,
        "notifications": notifications,
        "stats": {
            "enrolled_courses": len(courses),
            "pending_assignments": len([a for a in upcoming_assignments if not a.get('submission_id')]),
            "unread_notifications": len(notifications)
        }
    })
