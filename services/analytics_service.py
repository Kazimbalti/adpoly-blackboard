from utils.db import query, query_one
from services.grade_service import calculate_course_grade, percentage_to_letter


def get_course_analytics(course_id):
    enrollment_count = query_one(
        "SELECT COUNT(*) as cnt FROM enrollments WHERE course_id = ? AND status = 'active'",
        (course_id,)
    )['cnt']

    students = query(
        "SELECT u.id, u.first_name, u.last_name FROM users u "
        "JOIN enrollments e ON e.student_id = u.id "
        "WHERE e.course_id = ? AND e.status = 'active'",
        (course_id,)
    )

    grades = []
    for s in students:
        pct = calculate_course_grade(course_id, s['id'])
        if pct is not None:
            grades.append(pct)

    avg_grade = sum(grades) / len(grades) if grades else None

    grade_dist = {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0}
    for g in grades:
        letter = percentage_to_letter(g)
        bucket = letter[0] if letter != 'N/A' else 'F'
        grade_dist[bucket] = grade_dist.get(bucket, 0) + 1

    assignment_count = query_one(
        "SELECT COUNT(*) as cnt FROM assignments WHERE course_id = ?",
        (course_id,)
    )['cnt']

    submission_count = query_one(
        """SELECT COUNT(*) as cnt FROM submissions s
           JOIN assignments a ON a.id = s.assignment_id
           WHERE a.course_id = ?""",
        (course_id,)
    )['cnt']

    exam_count = query_one(
        "SELECT COUNT(*) as cnt FROM exams WHERE course_id = ?",
        (course_id,)
    )['cnt']

    return {
        'enrollment_count': enrollment_count,
        'average_grade': round(avg_grade, 1) if avg_grade else None,
        'grade_distribution': grade_dist,
        'assignment_count': assignment_count,
        'submission_count': submission_count,
        'exam_count': exam_count,
        'completion_rate': round((submission_count / (assignment_count * enrollment_count)) * 100, 1)
            if assignment_count > 0 and enrollment_count > 0 else 0
    }


def get_student_analytics(student_id):
    courses = query(
        """SELECT c.* FROM courses c
           JOIN enrollments e ON e.course_id = c.id
           WHERE e.student_id = ? AND e.status = 'active'""",
        (student_id,)
    )

    course_grades = []
    for c in courses:
        pct = calculate_course_grade(c['id'], student_id)
        course_grades.append({
            'course_id': c['id'],
            'course_code': c['code'],
            'course_title': c['title'],
            'percentage': round(pct, 1) if pct else None,
            'letter': percentage_to_letter(pct) if pct else 'N/A'
        })

    total_assignments = query_one(
        """SELECT COUNT(*) as cnt FROM assignments a
           JOIN courses c ON c.id = a.course_id
           JOIN enrollments e ON e.course_id = c.id
           WHERE e.student_id = ? AND e.status = 'active'""",
        (student_id,)
    )['cnt']

    submitted = query_one(
        "SELECT COUNT(*) as cnt FROM submissions WHERE student_id = ?",
        (student_id,)
    )['cnt']

    gpa_values = [g['percentage'] for g in course_grades if g['percentage'] is not None]
    overall_avg = sum(gpa_values) / len(gpa_values) if gpa_values else None

    return {
        'course_grades': course_grades,
        'overall_average': round(overall_avg, 1) if overall_avg else None,
        'overall_letter': percentage_to_letter(overall_avg),
        'total_assignments': total_assignments,
        'submitted_assignments': submitted,
        'completion_rate': round((submitted / total_assignments) * 100, 1) if total_assignments > 0 else 0
    }
