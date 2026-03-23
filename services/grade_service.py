from utils.db import query, query_one, execute


def calculate_course_grade(course_id, student_id):
    categories = query("SELECT * FROM grade_categories WHERE course_id = ?", (course_id,))
    if not categories:
        items = query(
            """SELECT gi.*, g.points_earned FROM grade_items gi
               LEFT JOIN grades g ON g.grade_item_id = gi.id AND g.student_id = ?
               WHERE gi.course_id = ?""",
            (student_id, course_id)
        )
        if not items:
            return None
        total_possible = sum(i['points_possible'] for i in items)
        total_earned = sum(i['points_earned'] or 0 for i in items if i['points_earned'] is not None)
        if total_possible == 0:
            return None
        return (total_earned / total_possible) * 100

    weighted_total = 0
    total_weight = 0

    for cat in categories:
        items = query(
            """SELECT gi.*, g.points_earned FROM grade_items gi
               LEFT JOIN grades g ON g.grade_item_id = gi.id AND g.student_id = ?
               WHERE gi.category_id = ?""",
            (student_id, cat['id'])
        )
        graded_items = [i for i in items if i['points_earned'] is not None]
        if not graded_items:
            continue

        cat_possible = sum(i['points_possible'] for i in graded_items)
        cat_earned = sum(i['points_earned'] for i in graded_items)

        if cat_possible > 0:
            cat_pct = (cat_earned / cat_possible) * 100
            weighted_total += cat_pct * (cat['weight'] / 100)
            total_weight += cat['weight']

    if total_weight == 0:
        return None
    return (weighted_total / total_weight) * 100


def percentage_to_letter(pct):
    if pct is None:
        return 'N/A'
    if pct >= 93:
        return 'A'
    elif pct >= 90:
        return 'A-'
    elif pct >= 87:
        return 'B+'
    elif pct >= 83:
        return 'B'
    elif pct >= 80:
        return 'B-'
    elif pct >= 77:
        return 'C+'
    elif pct >= 73:
        return 'C'
    elif pct >= 70:
        return 'C-'
    elif pct >= 67:
        return 'D+'
    elif pct >= 60:
        return 'D'
    return 'F'


def sync_assignment_grade(assignment_id, student_id, points):
    from utils.db import query_one, execute
    item = query_one(
        "SELECT * FROM grade_items WHERE source_type = 'assignment' AND source_id = ?",
        (assignment_id,)
    )
    if not item:
        return

    existing = query_one(
        "SELECT * FROM grades WHERE grade_item_id = ? AND student_id = ?",
        (item['id'], student_id)
    )
    if existing:
        execute(
            "UPDATE grades SET points_earned = ?, updated_at = datetime('now') WHERE id = ?",
            (points, existing['id'])
        )
    else:
        execute(
            "INSERT INTO grades (grade_item_id, student_id, points_earned) VALUES (?, ?, ?)",
            (item['id'], student_id, points)
        )


def sync_exam_grade(exam_id, student_id, points):
    item = query_one(
        "SELECT * FROM grade_items WHERE source_type = 'exam' AND source_id = ?",
        (exam_id,)
    )
    if not item:
        return

    existing = query_one(
        "SELECT * FROM grades WHERE grade_item_id = ? AND student_id = ?",
        (item['id'], student_id)
    )
    if existing:
        execute(
            "UPDATE grades SET points_earned = ?, updated_at = datetime('now') WHERE id = ?",
            (points, existing['id'])
        )
    else:
        execute(
            "INSERT INTO grades (grade_item_id, student_id, points_earned) VALUES (?, ?, ?)",
            (item['id'], student_id, points)
        )
