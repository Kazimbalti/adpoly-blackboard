from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from utils.db import query, query_one, execute

attendance_bp = Blueprint('attendance', __name__)


@attendance_bp.route('/course/<int:course_id>/sessions', methods=['GET'])
@login_required
def list_sessions(course_id):
    sessions = query(
        "SELECT * FROM attendance_sessions WHERE course_id = ? ORDER BY session_date DESC",
        (course_id,)
    )
    return jsonify({"sessions": sessions})


@attendance_bp.route('/course/<int:course_id>/sessions', methods=['POST'])
@faculty_required
def create_session(course_id):
    data = request.get_json()
    if not data or not data.get('session_date'):
        return jsonify({"error": "session_date is required"}), 400

    session_id = execute(
        """INSERT INTO attendance_sessions (course_id, session_date, session_type, topic, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            course_id,
            data['session_date'],
            data.get('session_type', 'lecture'),
            data.get('topic'),
            data.get('notes'),
            g.current_user['id']
        )
    )

    session = query_one("SELECT * FROM attendance_sessions WHERE id = ?", (session_id,))
    return jsonify({"message": "Session created", "session": session}), 201


@attendance_bp.route('/sessions/<int:session_id>', methods=['GET'])
@login_required
def get_session(session_id):
    session = query_one("SELECT * FROM attendance_sessions WHERE id = ?", (session_id,))
    if not session:
        return jsonify({"error": "Session not found"}), 404

    records = query(
        """SELECT ar.*, u.first_name, u.last_name, u.email
           FROM attendance_records ar
           JOIN users u ON u.id = ar.student_id
           WHERE ar.session_id = ?
           ORDER BY u.last_name, u.first_name""",
        (session_id,)
    )

    return jsonify({"session": session, "records": records})


@attendance_bp.route('/sessions/<int:session_id>/record', methods=['POST'])
@faculty_required
def mark_attendance(session_id):
    data = request.get_json()
    if not data or not data.get('student_id') or not data.get('status'):
        return jsonify({"error": "student_id and status are required"}), 400

    session = query_one("SELECT * FROM attendance_sessions WHERE id = ?", (session_id,))
    if not session:
        return jsonify({"error": "Session not found"}), 404

    existing = query_one(
        "SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?",
        (session_id, data['student_id'])
    )

    if existing:
        execute(
            """UPDATE attendance_records
               SET status = ?, check_in_time = ?, notes = ?, updated_at = datetime('now')
               WHERE id = ?""",
            (data['status'], data.get('check_in_time'), data.get('notes'), existing['id'])
        )
    else:
        execute(
            """INSERT INTO attendance_records (session_id, student_id, status, check_in_time, notes)
               VALUES (?, ?, ?, ?, ?)""",
            (session_id, data['student_id'], data['status'], data.get('check_in_time'), data.get('notes'))
        )

    return jsonify({"message": "Attendance recorded"})


@attendance_bp.route('/sessions/<int:session_id>/bulk', methods=['POST'])
@faculty_required
def bulk_attendance(session_id):
    data = request.get_json()
    if not data or not data.get('records'):
        return jsonify({"error": "records array is required"}), 400

    session = query_one("SELECT * FROM attendance_sessions WHERE id = ?", (session_id,))
    if not session:
        return jsonify({"error": "Session not found"}), 404

    for record in data['records']:
        student_id = record.get('student_id')
        status = record.get('status')
        if not student_id or not status:
            continue

        existing = query_one(
            "SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?",
            (session_id, student_id)
        )

        if existing:
            execute(
                """UPDATE attendance_records
                   SET status = ?, check_in_time = ?, notes = ?, updated_at = datetime('now')
                   WHERE id = ?""",
                (status, record.get('check_in_time'), record.get('notes'), existing['id'])
            )
        else:
            execute(
                """INSERT INTO attendance_records (session_id, student_id, status, check_in_time, notes)
                   VALUES (?, ?, ?, ?, ?)""",
                (session_id, student_id, status, record.get('check_in_time'), record.get('notes'))
            )

    return jsonify({"message": "Bulk attendance updated"})


@attendance_bp.route('/course/<int:course_id>/student/<int:student_id>', methods=['GET'])
@login_required
def student_attendance(course_id, student_id):
    sessions = query(
        "SELECT * FROM attendance_sessions WHERE course_id = ? ORDER BY session_date DESC",
        (course_id,)
    )
    total = len(sessions)

    records = query(
        """SELECT ar.*, asess.session_date, asess.session_type, asess.topic
           FROM attendance_records ar
           JOIN attendance_sessions asess ON asess.id = ar.session_id
           WHERE asess.course_id = ? AND ar.student_id = ?
           ORDER BY asess.session_date DESC""",
        (course_id, student_id)
    )

    present = sum(1 for r in records if r['status'] == 'present')
    absent = sum(1 for r in records if r['status'] == 'absent')
    late = sum(1 for r in records if r['status'] == 'late')
    excused = sum(1 for r in records if r['status'] == 'excused')
    attendance_pct = round((present + late) / total * 100, 1) if total > 0 else 0

    return jsonify({
        "student_id": student_id,
        "course_id": course_id,
        "total_sessions": total,
        "present": present,
        "absent": absent,
        "late": late,
        "excused": excused,
        "attendance_percentage": attendance_pct,
        "records": records
    })


@attendance_bp.route('/course/<int:course_id>/report', methods=['GET'])
@faculty_required
def course_report(course_id):
    sessions = query(
        "SELECT * FROM attendance_sessions WHERE course_id = ? ORDER BY session_date DESC",
        (course_id,)
    )
    total_sessions = len(sessions)

    students = query(
        """SELECT u.id, u.first_name, u.last_name, u.email
           FROM users u JOIN enrollments e ON e.student_id = u.id
           WHERE e.course_id = ? AND e.status = 'active'
           ORDER BY u.last_name, u.first_name""",
        (course_id,)
    )

    report = []
    for student in students:
        records = query(
            """SELECT ar.status FROM attendance_records ar
               JOIN attendance_sessions asess ON asess.id = ar.session_id
               WHERE asess.course_id = ? AND ar.student_id = ?""",
            (course_id, student['id'])
        )

        present = sum(1 for r in records if r['status'] == 'present')
        absent = sum(1 for r in records if r['status'] == 'absent')
        late = sum(1 for r in records if r['status'] == 'late')
        excused = sum(1 for r in records if r['status'] == 'excused')
        attendance_pct = round((present + late) / total_sessions * 100, 1) if total_sessions > 0 else 0

        report.append({
            "student_id": student['id'],
            "first_name": student['first_name'],
            "last_name": student['last_name'],
            "email": student['email'],
            "total_sessions": total_sessions,
            "present": present,
            "absent": absent,
            "late": late,
            "excused": excused,
            "attendance_percentage": attendance_pct
        })

    return jsonify({"course_id": course_id, "total_sessions": total_sessions, "report": report})


@attendance_bp.route('/sessions/<int:session_id>', methods=['DELETE'])
@faculty_required
def delete_session(session_id):
    session = query_one("SELECT * FROM attendance_sessions WHERE id = ?", (session_id,))
    if not session:
        return jsonify({"error": "Session not found"}), 404

    execute("DELETE FROM attendance_sessions WHERE id = ?", (session_id,))
    return jsonify({"message": "Session deleted"})
