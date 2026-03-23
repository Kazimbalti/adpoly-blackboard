import json
import random
from datetime import datetime, timezone
from utils.db import query, query_one, execute


def get_exam_questions(exam_id, shuffle=False):
    questions = query("SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY sort_order", (exam_id,))
    if shuffle:
        random.shuffle(questions)
    for q in questions:
        if q['options']:
            q['options'] = json.loads(q['options'])
    return questions


def get_exam_for_student(exam_id):
    """Get exam questions without correct answers"""
    questions = get_exam_questions(exam_id, shuffle=True)
    for q in questions:
        q.pop('correct_answer', None)
        q.pop('rubric', None)
        if q.get('options') and isinstance(q['options'], list):
            random.shuffle(q['options'])
    return questions


def start_attempt(exam_id, student_id, ip_address=None):
    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    if not exam:
        return None, "Exam not found"

    existing = query_one(
        "SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ? AND status = 'in_progress'",
        (exam_id, student_id)
    )
    if existing:
        return existing, None

    attempt_count = query_one(
        "SELECT COUNT(*) as cnt FROM exam_attempts WHERE exam_id = ? AND student_id = ?",
        (exam_id, student_id)
    )
    if attempt_count['cnt'] >= exam['max_attempts']:
        return None, "Maximum attempts reached"

    attempt_id = execute(
        "INSERT INTO exam_attempts (exam_id, student_id, ip_address) VALUES (?, ?, ?)",
        (exam_id, student_id, ip_address)
    )
    return query_one("SELECT * FROM exam_attempts WHERE id = ?", (attempt_id,)), None


def submit_attempt(attempt_id, answers):
    attempt = query_one("SELECT * FROM exam_attempts WHERE id = ?", (attempt_id,))
    if not attempt or attempt['status'] != 'in_progress':
        return None, "Invalid attempt"

    exam = query_one("SELECT * FROM exams WHERE id = ?", (attempt['exam_id'],))
    total_score = 0

    for answer in answers:
        question = query_one("SELECT * FROM exam_questions WHERE id = ?", (answer['question_id'],))
        if not question:
            continue

        is_correct = None
        score = None

        if question['question_type'] in ('mcq', 'true_false'):
            is_correct = 1 if answer.get('answer_text') == question['correct_answer'] else 0
            score = question['points'] if is_correct else 0
            total_score += score

        execute(
            """INSERT OR REPLACE INTO exam_answers (attempt_id, question_id, answer_text, is_correct, score)
               VALUES (?, ?, ?, ?, ?)""",
            (attempt_id, answer['question_id'], answer.get('answer_text'), is_correct, score)
        )

    execute(
        "UPDATE exam_attempts SET status = 'submitted', submitted_at = datetime('now'), total_score = ? WHERE id = ?",
        (total_score, attempt_id)
    )

    return query_one("SELECT * FROM exam_attempts WHERE id = ?", (attempt_id,)), None


def auto_submit_attempt(attempt_id, reason='time_expired'):
    attempt = query_one("SELECT * FROM exam_attempts WHERE id = ?", (attempt_id,))
    if not attempt or attempt['status'] != 'in_progress':
        return

    answers = query("SELECT * FROM exam_answers WHERE attempt_id = ?", (attempt_id,))
    total_score = sum(a['score'] or 0 for a in answers)

    execute(
        """UPDATE exam_attempts SET status = 'submitted', submitted_at = datetime('now'),
           total_score = ?, auto_submitted = 1 WHERE id = ?""",
        (total_score, attempt_id)
    )


def log_violation(attempt_id, event_type, details=None):
    execute(
        "INSERT INTO proctor_events (attempt_id, event_type, details) VALUES (?, ?, ?)",
        (attempt_id, event_type, json.dumps(details) if details else None)
    )

    attempt = query_one("SELECT * FROM exam_attempts WHERE id = ?", (attempt_id,))
    new_count = (attempt['violation_count'] or 0) + 1
    execute("UPDATE exam_attempts SET violation_count = ? WHERE id = ?", (new_count, attempt_id))

    exam = query_one("SELECT * FROM exams WHERE id = ?", (attempt['exam_id'],))
    if new_count >= exam['max_violations']:
        auto_submit_attempt(attempt_id, reason='max_violations')
        return True  # auto-submitted

    return False


def check_time_remaining(attempt_id):
    attempt = query_one("SELECT * FROM exam_attempts WHERE id = ?", (attempt_id,))
    if not attempt or attempt['status'] != 'in_progress':
        return 0

    exam = query_one("SELECT * FROM exams WHERE id = ?", (attempt['exam_id'],))
    started = datetime.fromisoformat(attempt['started_at'])
    elapsed = (datetime.now(timezone.utc) - started.replace(tzinfo=timezone.utc)).total_seconds()
    remaining = max(0, exam['duration_minutes'] * 60 - elapsed)

    if remaining <= 0:
        auto_submit_attempt(attempt_id, reason='time_expired')

    return int(remaining)
