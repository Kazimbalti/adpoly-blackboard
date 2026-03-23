from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from services.grade_service import calculate_course_grade, percentage_to_letter
from services.analytics_service import get_course_analytics, get_student_analytics
from utils.db import query, query_one, execute

grades_bp = Blueprint('grades', __name__)


@grades_bp.route('/course/<int:course_id>', methods=['GET'])
@login_required
def get_gradebook(course_id):
    user = g.current_user

    categories = query(
        "SELECT * FROM grade_categories WHERE course_id = ? ORDER BY sort_order",
        (course_id,)
    )
    items = query(
        "SELECT * FROM grade_items WHERE course_id = ? ORDER BY created_at",
        (course_id,)
    )

    if user['role'] == 'student':
        for item in items:
            grade = query_one(
                "SELECT * FROM grades WHERE grade_item_id = ? AND student_id = ?",
                (item['id'], user['id'])
            )
            item['grade'] = grade

        overall_pct = calculate_course_grade(course_id, user['id'])
        return jsonify({
            "categories": categories,
            "items": items,
            "overall_percentage": round(overall_pct, 1) if overall_pct else None,
            "overall_letter": percentage_to_letter(overall_pct)
        })

    # Faculty view - full gradebook
    students = query(
        """SELECT u.id, u.first_name, u.last_name, u.email
           FROM users u JOIN enrollments e ON e.student_id = u.id
           WHERE e.course_id = ? AND e.status = 'active'
           ORDER BY u.last_name, u.first_name""",
        (course_id,)
    )

    for student in students:
        student['grades'] = {}
        for item in items:
            grade = query_one(
                "SELECT * FROM grades WHERE grade_item_id = ? AND student_id = ?",
                (item['id'], student['id'])
            )
            student['grades'][item['id']] = grade

        pct = calculate_course_grade(course_id, student['id'])
        student['overall_percentage'] = round(pct, 1) if pct else None
        student['overall_letter'] = percentage_to_letter(pct)

    return jsonify({
        "categories": categories,
        "items": items,
        "students": students
    })


@grades_bp.route('/course/<int:course_id>/update', methods=['POST'])
@faculty_required
def update_grade(course_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    grade_item_id = data.get('grade_item_id')
    student_id = data.get('student_id')
    points_earned = data.get('points_earned')

    if not grade_item_id or not student_id:
        return jsonify({"error": "grade_item_id and student_id required"}), 400

    existing = query_one(
        "SELECT * FROM grades WHERE grade_item_id = ? AND student_id = ?",
        (grade_item_id, student_id)
    )

    if existing:
        execute(
            "UPDATE grades SET points_earned = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
            (points_earned, data.get('notes', ''), existing['id'])
        )
    else:
        execute(
            "INSERT INTO grades (grade_item_id, student_id, points_earned, notes) VALUES (?, ?, ?, ?)",
            (grade_item_id, student_id, points_earned, data.get('notes', ''))
        )

    return jsonify({"message": "Grade updated"})


@grades_bp.route('/course/<int:course_id>/analytics', methods=['GET'])
@faculty_required
def course_analytics(course_id):
    analytics = get_course_analytics(course_id)
    return jsonify({"analytics": analytics})


@grades_bp.route('/student/analytics', methods=['GET'])
@login_required
def student_analytics():
    analytics = get_student_analytics(g.current_user['id'])
    return jsonify({"analytics": analytics})


@grades_bp.route('/course/<int:course_id>/categories', methods=['POST'])
@faculty_required
def manage_categories(course_id):
    data = request.get_json()
    if not data or not data.get('categories'):
        return jsonify({"error": "Categories array required"}), 400

    # Validate weights sum to 100
    total_weight = sum(c.get('weight', 0) for c in data['categories'])
    if abs(total_weight - 100) > 0.01:
        return jsonify({"error": "Category weights must sum to 100"}), 400

    # Delete existing and recreate
    execute("DELETE FROM grade_categories WHERE course_id = ?", (course_id,))

    for i, cat in enumerate(data['categories']):
        execute(
            "INSERT INTO grade_categories (course_id, name, weight, sort_order) VALUES (?, ?, ?, ?)",
            (course_id, cat['name'], cat['weight'], i)
        )

    categories = query(
        "SELECT * FROM grade_categories WHERE course_id = ? ORDER BY sort_order",
        (course_id,)
    )
    return jsonify({"message": "Categories updated", "categories": categories})
