import json
from flask import Blueprint, request, jsonify, g
from middleware.auth_middleware import login_required, faculty_required
from services.exam_service import (
    get_exam_questions, get_exam_for_student, start_attempt,
    submit_attempt, log_violation, check_time_remaining,
    calculate_exam_grade, QUESTION_TYPES
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
            # Count ungraded manual answers
            e['needs_grading'] = query_one(
                """SELECT COUNT(*) as cnt FROM exam_answers ea
                   JOIN exam_attempts et ON et.id = ea.attempt_id
                   WHERE et.exam_id = ? AND ea.score IS NULL AND ea.ai_draft_score IS NOT NULL""",
                (e['id'],)
            )['cnt']
    else:
        exams = query(
            "SELECT * FROM exams WHERE course_id = ? AND is_published = 1 ORDER BY start_window",
            (course_id,)
        )
        for e in exams:
            attempts = query(
                """SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?
                   ORDER BY attempt_number DESC""",
                (e['id'], user['id'])
            )
            e['attempts'] = attempts
            e['attempt'] = attempts[0] if attempts else None
            e['attempts_used'] = len(attempts)

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
           show_results, max_attempts, grade_recording, proctor_enabled, require_webcam,
           detect_tab_switch, detect_copy_paste, lockdown_browser, max_violations)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (course_id, data['title'], sanitize_html(data.get('description', '')),
         data.get('exam_type', 'quiz'), data['duration_minutes'], data['total_points'],
         data.get('start_window'), data.get('end_window'),
         data.get('shuffle_questions', 0), data.get('shuffle_options', 0),
         data.get('show_results', 'after_submit'), data.get('max_attempts', 1),
         data.get('grade_recording', 'best'),
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
    matching_pairs = json.dumps(data['matching_pairs']) if data.get('matching_pairs') else None
    ordering_items = json.dumps(data['ordering_items']) if data.get('ordering_items') else None
    accepted_answers = json.dumps(data['accepted_answers']) if data.get('accepted_answers') else None
    correct_answers = json.dumps(data['correct_answers']) if data.get('correct_answers') else None
    hotspot_regions = json.dumps(data['hotspot_regions']) if data.get('hotspot_regions') else None
    keywords = json.dumps(data['keywords']) if data.get('keywords') else None

    q_id = execute(
        """INSERT INTO exam_questions (exam_id, question_type, question_text, points,
           sort_order, options, correct_answer, correct_answers, word_limit, word_limit_min,
           rubric, matching_pairs, ordering_items, accepted_answers, case_sensitive,
           numeric_answer, numeric_tolerance, image_path, hotspot_regions,
           allowed_file_types, partial_credit, keywords)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (exam_id, data['question_type'], sanitize_html(data['question_text']),
         data['points'], data.get('sort_order', 0), options,
         data.get('correct_answer'), correct_answers,
         data.get('word_limit'), data.get('word_limit_min', 0),
         sanitize_html(data.get('rubric', '')),
         matching_pairs, ordering_items, accepted_answers,
         data.get('case_sensitive', 0),
         data.get('numeric_answer'), data.get('numeric_tolerance', 0),
         data.get('image_path'), hotspot_regions,
         data.get('allowed_file_types'), data.get('partial_credit', 0),
         keywords)
    )

    question = query_one("SELECT * FROM exam_questions WHERE id = ?", (q_id,))
    if question.get('options'):
        try:
            question['options'] = json.loads(question['options'])
        except (json.JSONDecodeError, TypeError):
            pass
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
        matching_pairs = json.dumps(q.get('matching_pairs')) if q.get('matching_pairs') else None
        ordering_items = json.dumps(q.get('ordering_items')) if q.get('ordering_items') else None
        accepted_answers = json.dumps(q.get('accepted_answers')) if q.get('accepted_answers') else None
        correct_answers = json.dumps(q.get('correct_answers')) if q.get('correct_answers') else None
        hotspot_regions = json.dumps(q.get('hotspot_regions')) if q.get('hotspot_regions') else None
        keywords = json.dumps(q.get('keywords')) if q.get('keywords') else None

        q_id = execute(
            """INSERT INTO exam_questions (exam_id, question_type, question_text, points,
               sort_order, options, correct_answer, correct_answers, word_limit, word_limit_min,
               rubric, matching_pairs, ordering_items, accepted_answers, case_sensitive,
               numeric_answer, numeric_tolerance, image_path, hotspot_regions,
               allowed_file_types, partial_credit, keywords)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (exam_id, q['question_type'], sanitize_html(q['question_text']),
             q['points'], q.get('sort_order', i), options,
             q.get('correct_answer'), correct_answers,
             q.get('word_limit'), q.get('word_limit_min', 0),
             sanitize_html(q.get('rubric', '')),
             matching_pairs, ordering_items, accepted_answers,
             q.get('case_sensitive', 0),
             q.get('numeric_answer'), q.get('numeric_tolerance', 0),
             q.get('image_path'), hotspot_regions,
             q.get('allowed_file_types'), q.get('partial_credit', 0),
             keywords)
        )
        added.append(q_id)

    return jsonify({"message": f"{len(added)} questions added"}), 201


@exams_bp.route('/<int:exam_id>/start', methods=['POST'])
@login_required
def start_exam(exam_id):
    user = g.current_user
    attempt, error = start_attempt(
        exam_id, user['id'], request.remote_addr,
        request.headers.get('User-Agent', '')
    )
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
            "total_points": exam['total_points'],
            "end_window": exam.get('end_window'),
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

    # Calculate and sync grade based on recording rule
    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    final_grade = calculate_exam_grade(exam_id, g.current_user['id'])
    if final_grade is not None:
        sync_exam_grade(exam_id, g.current_user['id'], final_grade)

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
            """SELECT ea.*, eq.question_text, eq.question_type, eq.points as max_points,
                      eq.correct_answer, eq.rubric
               FROM exam_answers ea
               JOIN exam_questions eq ON eq.id = ea.question_id
               WHERE ea.attempt_id = ?""",
            (a['id'],)
        )

    return jsonify({"attempts": attempts})


@exams_bp.route('/<int:exam_id>/attempts/<int:student_id>', methods=['GET'])
@login_required
def get_student_attempts(exam_id, student_id):
    """Get all attempts for a student (for attempt history view)"""
    user = g.current_user
    if user['role'] == 'student' and user['id'] != student_id:
        return jsonify({"error": "Unauthorized"}), 403

    attempts = query(
        """SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?
           ORDER BY attempt_number""",
        (exam_id, student_id)
    )
    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))

    return jsonify({
        "attempts": attempts,
        "max_attempts": exam['max_attempts'] if exam else 1,
        "grade_recording": exam.get('grade_recording', 'best') if exam else 'best'
    })


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
                  'show_results', 'max_attempts', 'grade_recording', 'proctor_enabled',
                  'require_webcam', 'detect_tab_switch', 'detect_copy_paste',
                  'lockdown_browser', 'max_violations']:
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
def grade_answer_route(answer_id):
    data = request.get_json()
    if not data or 'score' not in data:
        return jsonify({"error": "Score required"}), 400

    execute(
        """UPDATE exam_answers SET score = ?, feedback = ?, is_correct = ?,
           faculty_confirmed = 1 WHERE id = ?""",
        (data['score'], sanitize_html(data.get('feedback', '')),
         1 if data['score'] > 0 else 0, answer_id)
    )

    # Recalculate total score for the attempt
    answer = query_one("SELECT * FROM exam_answers WHERE id = ?", (answer_id,))
    attempt = query_one("SELECT * FROM exam_attempts WHERE id = ?", (answer['attempt_id'],))
    total = query_one(
        "SELECT COALESCE(SUM(score), 0) as total FROM exam_answers WHERE attempt_id = ? AND score IS NOT NULL",
        (answer['attempt_id'],)
    )

    # Check if all answers are graded
    ungraded = query_one(
        "SELECT COUNT(*) as cnt FROM exam_answers WHERE attempt_id = ? AND score IS NULL",
        (answer['attempt_id'],)
    )
    new_status = 'graded' if ungraded['cnt'] == 0 else 'submitted'

    execute(
        "UPDATE exam_attempts SET total_score = ?, status = ? WHERE id = ?",
        (total['total'], new_status, answer['attempt_id'])
    )

    # Sync grade using recording rule
    final_grade = calculate_exam_grade(attempt['exam_id'], attempt['student_id'])
    if final_grade is not None:
        sync_exam_grade(attempt['exam_id'], attempt['student_id'], final_grade)

    return jsonify({"message": "Answer graded"})


@exams_bp.route('/questions/<int:question_id>', methods=['DELETE'])
@faculty_required
def delete_question(question_id):
    question = query_one("SELECT * FROM exam_questions WHERE id = ?", (question_id,))
    if not question:
        return jsonify({"error": "Question not found"}), 404
    execute("DELETE FROM exam_questions WHERE id = ?", (question_id,))
    return jsonify({"message": "Question deleted"})


@exams_bp.route('/questions/<int:question_id>', methods=['PUT'])
@faculty_required
def update_question(question_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    updates = []
    params = []
    for field in ['question_type', 'question_text', 'points', 'sort_order',
                  'correct_answer', 'word_limit', 'word_limit_min', 'rubric',
                  'case_sensitive', 'numeric_answer', 'numeric_tolerance',
                  'image_path', 'allowed_file_types', 'partial_credit']:
        if field in data:
            val = sanitize_html(data[field]) if field in ('question_text', 'rubric') else data[field]
            updates.append(f"{field} = ?")
            params.append(val)

    # JSON fields
    for field in ['options', 'matching_pairs', 'ordering_items', 'accepted_answers',
                  'correct_answers', 'hotspot_regions', 'keywords']:
        if field in data:
            updates.append(f"{field} = ?")
            params.append(json.dumps(data[field]) if data[field] else None)

    if updates:
        params.append(question_id)
        execute(f"UPDATE exam_questions SET {', '.join(updates)} WHERE id = ?", params)

    question = query_one("SELECT * FROM exam_questions WHERE id = ?", (question_id,))
    return jsonify({"message": "Question updated", "question": question})
