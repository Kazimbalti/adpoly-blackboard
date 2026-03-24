import json
import random
from datetime import datetime, timezone
from utils.db import query, query_one, execute


# All supported question types
QUESTION_TYPES = [
    'mcq', 'multiple_answer', 'true_false', 'fill_blank', 'matching',
    'ordering', 'short_answer', 'essay', 'numeric', 'hotspot',
    'image_mcq', 'file_upload'
]

# Types that can be auto-graded
AUTO_GRADE_TYPES = ['mcq', 'multiple_answer', 'true_false', 'fill_blank',
                    'matching', 'ordering', 'numeric', 'hotspot']


def get_exam_questions(exam_id, shuffle=False):
    questions = query("SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY sort_order", (exam_id,))
    if shuffle:
        random.shuffle(questions)
    for q in questions:
        if q.get('options') and isinstance(q['options'], str):
            try:
                q['options'] = json.loads(q['options'])
            except (json.JSONDecodeError, TypeError):
                pass
        for json_field in ['matching_pairs', 'ordering_items', 'accepted_answers',
                           'correct_answers', 'hotspot_regions', 'keywords']:
            if q.get(json_field) and isinstance(q[json_field], str):
                try:
                    q[json_field] = json.loads(q[json_field])
                except (json.JSONDecodeError, TypeError):
                    pass
    return questions


def get_exam_for_student(exam_id):
    """Get exam questions without correct answers"""
    questions = get_exam_questions(exam_id, shuffle=True)
    # Fields to strip from student view
    secret_fields = ['correct_answer', 'correct_answers', 'rubric', 'keywords',
                     'accepted_answers', 'hotspot_regions', 'numeric_answer',
                     'numeric_tolerance']
    for q in questions:
        for field in secret_fields:
            q.pop(field, None)
        if q.get('options') and isinstance(q['options'], list):
            random.shuffle(q['options'])
        # For matching, shuffle the right column
        if q.get('matching_pairs') and isinstance(q['matching_pairs'], list):
            rights = [p.get('right', '') for p in q['matching_pairs']]
            random.shuffle(rights)
            q['matching_right_options'] = rights
            q['matching_left_items'] = [p.get('left', '') for p in q['matching_pairs']]
            del q['matching_pairs']
        # For ordering, shuffle the items
        if q.get('ordering_items') and isinstance(q['ordering_items'], list):
            shuffled = list(q['ordering_items'])
            random.shuffle(shuffled)
            q['ordering_items'] = shuffled
    return questions


def check_deadline(exam_id):
    """Check if exam is within its availability window"""
    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    if not exam:
        return None, "Exam not found"

    now = datetime.now(timezone.utc)

    if exam.get('start_window'):
        start = datetime.fromisoformat(exam['start_window']).replace(tzinfo=timezone.utc)
        if now < start:
            return None, f"This exam is not available until {exam['start_window']}"

    if exam.get('end_window'):
        end = datetime.fromisoformat(exam['end_window']).replace(tzinfo=timezone.utc)
        if now > end:
            return None, "The deadline for this exam has passed. Submissions are locked."

    return exam, None


def start_attempt(exam_id, student_id, ip_address=None, user_agent=None):
    exam, error = check_deadline(exam_id)
    if error:
        return None, error

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

    attempt_num = attempt_count['cnt'] + 1
    attempt_id = execute(
        """INSERT INTO exam_attempts (exam_id, student_id, ip_address, user_agent, attempt_number)
           VALUES (?, ?, ?, ?, ?)""",
        (exam_id, student_id, ip_address, user_agent, attempt_num)
    )
    return query_one("SELECT * FROM exam_attempts WHERE id = ?", (attempt_id,)), None


def grade_answer(question, answer_text):
    """Auto-grade a single answer based on question type. Returns (is_correct, score)."""
    qtype = question['question_type']
    points = question['points']

    if qtype in ('mcq', 'true_false'):
        correct = question.get('correct_answer', '')
        is_correct = 1 if str(answer_text).strip() == str(correct).strip() else 0
        return is_correct, points if is_correct else 0

    elif qtype == 'multiple_answer':
        # answer_text is JSON array of selected options
        try:
            selected = json.loads(answer_text) if isinstance(answer_text, str) else answer_text
        except (json.JSONDecodeError, TypeError):
            selected = []
        if not isinstance(selected, list):
            selected = [selected]

        correct_list = question.get('correct_answers', [])
        if isinstance(correct_list, str):
            try:
                correct_list = json.loads(correct_list)
            except (json.JSONDecodeError, TypeError):
                correct_list = []

        correct_set = set(str(c).strip() for c in correct_list)
        selected_set = set(str(s).strip() for s in selected)

        if question.get('partial_credit'):
            # Partial credit: +1 for each correct, -1 for each wrong (min 0)
            if not correct_set:
                return 0, 0
            correct_count = len(selected_set & correct_set)
            wrong_count = len(selected_set - correct_set)
            raw = max(0, correct_count - wrong_count)
            score = round((raw / len(correct_set)) * points, 2)
            is_correct = 1 if selected_set == correct_set else 0
            return is_correct, score
        else:
            is_correct = 1 if selected_set == correct_set else 0
            return is_correct, points if is_correct else 0

    elif qtype == 'fill_blank':
        accepted = question.get('accepted_answers', [])
        if isinstance(accepted, str):
            try:
                accepted = json.loads(accepted)
            except (json.JSONDecodeError, TypeError):
                accepted = [accepted]

        student_ans = str(answer_text).strip()
        case_sensitive = question.get('case_sensitive', 0)

        for acc in accepted:
            acc_str = str(acc).strip()
            if case_sensitive:
                if student_ans == acc_str:
                    return 1, points
            else:
                if student_ans.lower() == acc_str.lower():
                    return 1, points
        return 0, 0

    elif qtype == 'matching':
        # answer_text is JSON: {"left_item": "right_item", ...}
        try:
            student_matches = json.loads(answer_text) if isinstance(answer_text, str) else answer_text
        except (json.JSONDecodeError, TypeError):
            student_matches = {}
        if not isinstance(student_matches, dict):
            student_matches = {}

        pairs = question.get('matching_pairs', [])
        if isinstance(pairs, str):
            try:
                pairs = json.loads(pairs)
            except (json.JSONDecodeError, TypeError):
                pairs = []

        if not pairs:
            return 0, 0

        correct_count = 0
        for pair in pairs:
            left = str(pair.get('left', '')).strip()
            right = str(pair.get('right', '')).strip()
            if str(student_matches.get(left, '')).strip() == right:
                correct_count += 1

        score = round((correct_count / len(pairs)) * points, 2)
        is_correct = 1 if correct_count == len(pairs) else 0
        return is_correct, score

    elif qtype == 'ordering':
        # answer_text is JSON array in student's order
        try:
            student_order = json.loads(answer_text) if isinstance(answer_text, str) else answer_text
        except (json.JSONDecodeError, TypeError):
            student_order = []
        if not isinstance(student_order, list):
            student_order = []

        correct_order = question.get('ordering_items', [])
        if isinstance(correct_order, str):
            try:
                correct_order = json.loads(correct_order)
            except (json.JSONDecodeError, TypeError):
                correct_order = []

        if not correct_order:
            return 0, 0

        correct_count = sum(1 for i, item in enumerate(student_order)
                           if i < len(correct_order) and str(item).strip() == str(correct_order[i]).strip())
        score = round((correct_count / len(correct_order)) * points, 2)
        is_correct = 1 if correct_count == len(correct_order) else 0
        return is_correct, score

    elif qtype == 'numeric':
        try:
            student_val = float(answer_text)
        except (ValueError, TypeError):
            return 0, 0

        correct_val = question.get('numeric_answer')
        tolerance = question.get('numeric_tolerance', 0) or 0

        if correct_val is not None:
            if abs(student_val - float(correct_val)) <= float(tolerance):
                return 1, points
        return 0, 0

    elif qtype == 'hotspot':
        # answer_text is JSON: [{x, y}, ...] clicks
        try:
            clicks = json.loads(answer_text) if isinstance(answer_text, str) else answer_text
        except (json.JSONDecodeError, TypeError):
            clicks = []
        if not isinstance(clicks, list):
            clicks = []

        regions = question.get('hotspot_regions', [])
        if isinstance(regions, str):
            try:
                regions = json.loads(regions)
            except (json.JSONDecodeError, TypeError):
                regions = []

        if not regions:
            return 0, 0

        # Check if any click falls within any correct region
        hits = 0
        for region in regions:
            rx, ry = float(region.get('x', 0)), float(region.get('y', 0))
            rw, rh = float(region.get('width', 0)), float(region.get('height', 0))
            for click in clicks:
                cx, cy = float(click.get('x', 0)), float(click.get('y', 0))
                if rx <= cx <= rx + rw and ry <= cy <= ry + rh:
                    hits += 1
                    break

        score = round((hits / len(regions)) * points, 2)
        is_correct = 1 if hits == len(regions) else 0
        return is_correct, score

    elif qtype == 'short_answer':
        # AI keyword matching for draft score
        keywords = question.get('keywords', [])
        if isinstance(keywords, str):
            try:
                keywords = json.loads(keywords)
            except (json.JSONDecodeError, TypeError):
                keywords = [k.strip() for k in keywords.split(',') if k.strip()]

        if keywords and answer_text:
            answer_lower = str(answer_text).lower()
            matched = sum(1 for kw in keywords if str(kw).lower() in answer_lower)
            draft_score = round((matched / len(keywords)) * points, 2) if keywords else 0
            return None, draft_score  # None = needs faculty review
        return None, 0  # Needs manual grading

    # essay, file_upload: manual grading only
    return None, None


def submit_attempt(attempt_id, answers):
    attempt = query_one("SELECT * FROM exam_attempts WHERE id = ?", (attempt_id,))
    if not attempt or attempt['status'] != 'in_progress':
        return None, "Invalid attempt"

    exam = query_one("SELECT * FROM exams WHERE id = ?", (attempt['exam_id'],))
    total_score = 0
    has_manual_questions = False

    for answer in answers:
        question = query_one("SELECT * FROM exam_questions WHERE id = ?", (answer['question_id'],))
        if not question:
            continue

        answer_text = answer.get('answer_text')
        file_path = answer.get('file_path')
        file_name = answer.get('file_name')

        is_correct, score = grade_answer(question, answer_text)

        ai_draft_score = None
        if is_correct is None:
            # Needs manual grading
            has_manual_questions = True
            if question['question_type'] == 'short_answer' and score is not None:
                ai_draft_score = score
                score = None  # Don't count until faculty confirms

        if score is not None:
            total_score += score

        execute(
            """INSERT OR REPLACE INTO exam_answers
               (attempt_id, question_id, answer_text, is_correct, score, file_path, file_name, ai_draft_score)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (attempt_id, answer['question_id'], answer_text, is_correct, score,
             file_path, file_name, ai_draft_score)
        )

    status = 'submitted' if has_manual_questions else 'graded'
    execute(
        "UPDATE exam_attempts SET status = ?, submitted_at = datetime('now'), total_score = ? WHERE id = ?",
        (status, total_score, attempt_id)
    )

    # Notify faculty if manual grading needed
    if has_manual_questions:
        course = query_one("SELECT * FROM courses WHERE id = ?", (exam['course_id'],))
        if course:
            execute(
                "INSERT INTO notifications (user_id, title, body, link, notif_type, resource_type, resource_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (course['faculty_id'],
                 f"Quiz needs grading: {exam['title']}",
                 "Some answers require manual review (essay/short answer).",
                 f"#/courses/{exam['course_id']}",
                 'grading_needed', 'exam', exam['id'])
            )

    return query_one("SELECT * FROM exam_attempts WHERE id = ?", (attempt_id,)), None


def calculate_exam_grade(exam_id, student_id):
    """Calculate final grade based on grade_recording rule (best/last/average)"""
    exam = query_one("SELECT * FROM exams WHERE id = ?", (exam_id,))
    if not exam:
        return None

    attempts = query(
        """SELECT * FROM exam_attempts
           WHERE exam_id = ? AND student_id = ? AND status IN ('submitted', 'graded')
           ORDER BY attempt_number""",
        (exam_id, student_id)
    )

    if not attempts:
        return None

    scores = [a['total_score'] for a in attempts if a['total_score'] is not None]
    if not scores:
        return None

    rule = exam.get('grade_recording', 'best')
    if rule == 'best':
        return max(scores)
    elif rule == 'last':
        return scores[-1]
    elif rule == 'average':
        return round(sum(scores) / len(scores), 2)
    return max(scores)


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

    # Warning thresholds
    if new_count == 2:
        # Email alert to faculty (notification)
        course = query_one("SELECT * FROM courses WHERE id = ?", (exam['course_id'],))
        student = query_one("SELECT * FROM users WHERE id = ?", (attempt['student_id'],))
        if course and student:
            execute(
                "INSERT INTO notifications (user_id, title, body, link, notif_type) VALUES (?, ?, ?, ?, ?)",
                (course['faculty_id'],
                 f"Proctoring alert: {student['first_name']} {student['last_name']}",
                 f"Student has {new_count} violations in {exam['title']}",
                 f"#/courses/{exam['course_id']}",
                 'violation_alert')
            )

    if new_count >= exam['max_violations']:
        auto_submit_attempt(attempt_id, reason='max_violations')
        return True

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
