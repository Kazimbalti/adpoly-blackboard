import json
from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from services.exam_service import (
    get_exam_questions, get_exam_for_student, start_attempt,
    submit_attempt, log_violation, check_time_remaining
)
from services.grade_service import sync_exam_grade
from utils.db import query, query_one, execute
from utils.validators import validate_required, sanitize_html

exams_bp = Blueprint('exams', __name__)


@exams_bp.route('/course/<int:course_id>', methods=['GET'])
@login_required
def list_exams(course_id):
    user = g.current_user
    if user['role'] in ('faculty', 'admin'):
        exams = query("SELECT * FROM exams WHERE course_id = ? ORDER BY created_at DESC", (course_id,))
        for e in exams:
            e['attempt_count'] = query_one(
                "SELECT COUNT(*) as cnt FROM exam_attempts WHERE exam_id = ?",
                (e['id'],)
            )['cnt']
    else:
        exams = query(
            "SELECT * FROM exams WHERE course_id = ? AND is_published = 1 ORDER BY start_window",
            (course_id,)
        )
        for e in exams:
            attempt = query_one(
                "SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ? ORDER BY started_at DESC LIMIT 1",
                (e['id'], user['id'])
            )
            e['attempt'] = attempt

    return jsonify({"exams": exams})


@exams_bp.route('/course/<int:course_id>', methods=['POST'])
@faculty_required
def create_exam(course_id):
    course = query_one("SELECT * FROM courses WHERE id = ? AND faculty_id = ?",
                       (course_id, g.current_user['id']))
    if not course:
        return jsonify({"error": "Course not found or unauthorized"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    valid, msg = validate_required(data, ['title', 'duration_minutes', 'total_points'])
    if not valid:
        return jsonify({"error": msg}), 400

    exam_id = execute(
        """INSERT INTO exams (course_id, title, description, exam_type, duration_minutes,
           total_points, start_window, end_window, shuffle_questions, shuffle_options,
           show_results, max_attempts, proctor_enabled, require_webcam,
           detect_tab_switch, detect_copy_paste, lockdown_browser, max_violations)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (course_id, data['title'], sanitize_html(data.get('description', '')),
         data.get('exam_type', 'quiz'), data['duration_minutes'], data['total_points'],
         data.get('start_window'), data.get('end_window'),
         data.get('shuffle_questions', 0), data.get('shuffle_options', 0),
         data.get('show_results', 'after_submit'), data.get('max_attempts', 1),
         data.get('proctor_enabled', 0), data.get('require_webcam', 0),
         data.get('detect_tab_switch', 1), data.get('detect_copy_paste', 1),
         data.get('lockdown_browser', 0), data.get('max_violations', 5))
    )

    # Create grade item
    cat = query_one(
        "SELECT id FROM grade_categories WHERE course_id = ? AND name = 'Exams'",
        (course_id,)
    )
    if cat:
        execute(
            """INSERT INTO grade_items (course_id, category_id, title, points_possible, source_type, source_id)
               VALUES (?, ?, ?, ?, 'exam', ?)""",
            (course_id, cat['id'], data['title'], data['total_points'], exam_id)
        )

    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    return jsonify({"message": "Exam created", "exam": exam}), 201


@exams_bp.route('/<int:exam_id>/questions', methods=['POST'])
@faculty_required
def add_question(exam_id):
    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    if not exam:
        return jsonify({"error": "Exam not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    valid, msg = validate_required(data, ['question_type', 'question_text', 'points'])
    if not valid:
        return jsonify({"error": msg}), 400

    options = json.dumps(data['options']) if data.get('options') else None

    q_id = execute(
        """INSERT INTO exam_questions (exam_id, question_type, question_text, points,
           sort_order, options, correct_answer, word_limit, rubric)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (exam_id, data['question_type'], sanitize_html(data['question_text']),
         data['points'], data.get('sort_order', 0), options,
         data.get('correct_answer'), data.get('word_limit'),
         sanitize_html(data.get('rubric', '')))
    )

    question = query_one("SELECT * FROM exam_questions WHERE id = ?", (q_id,))
    if question['options']:
        question['options'] = json.loads(question['options'])
    return jsonify({"message": "Question added", "question": question}), 201


@exams_bp.route('/<int:exam_id>/questions', methods=['GET'])
@login_required
def list_questions(exam_id):
    user = g.current_user
    if user['role'] in ('faculty', 'admin'):
        questions = get_exam_questions(exam_id)
    else:
        questions = get_exam_for_student(exam_id)
    return jsonify({"questions": questions})


@exams_bp.route('/<int:exam_id>/questions/bulk', methods=['POST'])
@faculty_required
def bulk_add_questions(exam_id):
    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    if not exam:
        return jsonify({"error": "Exam not found"}), 404

    data = request.get_json()
    if not data or not data.get('questions'):
        return jsonify({"error": "Questions array required"}), 400

    added = []
    for i, q in enumerate(data['questions']):
        options = json.dumps(q['options']) if q.get('options') else None
        q_id = execute(
            """INSERT INTO exam_questions (exam_id, question_type, question_text, points,
               sort_order, options, correct_answer, word_limit, rubric)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (exam_id, q['question_type'], sanitize_html(q['question_text']),
             q['points'], q.get('sort_order', i), options,
             q.get('correct_answer'), q.get('word_limit'),
             sanitize_html(q.get('rubric', '')))
        )
        added.append(q_id)

    return jsonify({"message": f"{len(added)} questions added"}), 201


@exams_bp.route('/<int:exam_id>/start', methods=['POST'])
@login_required
def start_exam(exam_id):
    user = g.current_user
    attempt, error = start_attempt(exam_id, user['id'], request.remote_addr)
    if error:
        return jsonify({"error": error}), 400

    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    questions = get_exam_for_student(exam_id)
    remaining = check_time_remaining(attempt['id'])

    return jsonify({
        "attempt": attempt,
        "exam": {
            "title": exam['title'],
            "duration_minutes": exam['duration_minutes'],
            "proctor_enabled": bool(exam['proctor_enabled']),
            "require_webcam": bool(exam['require_webcam']),
            "detect_tab_switch": bool(exam['detect_tab_switch']),
            "detect_copy_paste": bool(exam['detect_copy_paste']),
            "lockdown_browser": bool(exam['lockdown_browser']),
            "max_violations": exam['max_violations']
        },
        "questions": questions,
        "time_remaining": remaining
    })


@exams_bp.route('/<int:exam_id>/submit', methods=['POST'])
@login_required
def submit_exam(exam_id):
    data = request.get_json()
    if not data or not data.get('attempt_id'):
        return jsonify({"error": "attempt_id and answers required"}), 400

    attempt, error = submit_attempt(data['attempt_id'], data.get('answers', []))
    if error:
        return jsonify({"error": error}), 400

    # Sync grade
    if attempt['total_score'] is not None:
        sync_exam_grade(exam_id, g.current_user['id'], attempt['total_score'])

    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    show_score = exam['show_results'] != 'never'

    return jsonify({
        "message": "Exam submitted successfully",
        "attempt": attempt if show_score else {"status": "submitted"}
    })


@exams_bp.route('/attempts/<int:attempt_id>/violation', methods=['POST'])
@login_required
def report_violation(attempt_id):
    data = request.get_json()
    if not data or not data.get('event_type'):
        return jsonify({"error": "event_type required"}), 400

    auto_submitted = log_violation(
        attempt_id, data['event_type'], data.get('details')
    )

    return jsonify({
        "logged": True,
        "auto_submitted": auto_submitted
    })


@exams_bp.route('/attempts/<int:attempt_id>/time', methods=['GET'])
@login_required
def get_time_remaining(attempt_id):
    remaining = check_time_remaining(attempt_id)
    return jsonify({"time_remaining": remaining})


@exams_bp.route('/<int:exam_id>/results', methods=['GET'])
@faculty_required
def get_exam_results(exam_id):
    attempts = query(
        """SELECT ea.*, u.first_name, u.last_name, u.email
           FROM exam_attempts ea
           JOIN users u ON u.id = ea.student_id
           WHERE ea.exam_id = ?
           ORDER BY ea.started_at DESC""",
        (exam_id,)
    )

    for a in attempts:
        a['violations'] = query(
            "SELECT * FROM proctor_events WHERE attempt_id = ? ORDER BY created_at",
            (a['id'],)
        )
        a['answers'] = query(
            """SELECT ea.*, eq.question_text, eq.question_type, eq.points as max_points, eq.correct_answer
               FROM exam_answers ea
               JOIN exam_questions eq ON eq.id = ea.question_id
               WHERE ea.attempt_id = ?""",
            (a['id'],)
        )

    return jsonify({"attempts": attempts})


@exams_bp.route('/<int:exam_id>/publish', methods=['POST'])
@faculty_required
def publish_exam(exam_id):
    execute("UPDATE exams SET is_published = 1, updated_at = datetime('now') WHERE id = ?", (exam_id,))
    return jsonify({"message": "Exam published"})


@exams_bp.route('/<int:exam_id>', methods=['PUT'])
@faculty_required
def update_exam(exam_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    updates = []
    params = []
    for field in ['title', 'description', 'exam_type', 'duration_minutes', 'total_points',
                  'start_window', 'end_window', 'shuffle_questions', 'shuffle_options',
                  'show_results', 'max_attempts', 'proctor_enabled', 'require_webcam',
                  'detect_tab_switch', 'detect_copy_paste', 'lockdown_browser', 'max_violations']:
        if field in data:
            updates.append(f"{field} = ?")
            params.append(data[field])

    if updates:
        updates.append("updated_at = datetime('now')")
        params.append(exam_id)
        execute(f"UPDATE exams SET {', '.join(updates)} WHERE id = ?", params)

    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    return jsonify({"message": "Exam updated", "exam": exam})


@exams_bp.route('/answers/<int:answer_id>/grade', methods=['POST'])
@faculty_required
def grade_answer(answer_id):
    data = request.get_json()
    if not data or 'score' not in data:
        return jsonify({"error": "Score required"}), 400

    execute(
        "UPDATE exam_answers SET score = ?, feedback = ?, is_correct = ? WHERE id = ?",
        (data['score'], sanitize_html(data.get('feedback', '')),
         1 if data['score'] > 0 else 0, answer_id)
    )

    # Recalculate total score
    answer = query_one("SELECT * FROM exam_answers WHERE id = ?", (answer_id,))
    attempt = query_one("SELECT * FROM exam_attempts WHERE id = ?", (answer['attempt_id'],))
    total = query_one(
        "SELECT COALESCE(SUM(score), 0) as total FROM exam_answers WHERE attempt_id = ?",
        (answer['attempt_id'],)
    )
    execute(
        "UPDATE exam_attempts SET total_score = ?, status = 'graded' WHERE id = ?",
        (total['total'], answer['attempt_id'])
    )

    sync_exam_grade(attempt['exam_id'], attempt['student_id'], total['total'])

    return jsonify({"message": "Answer graded"})
