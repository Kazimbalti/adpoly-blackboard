-- BB_ADPOLY Learning Management System - Database Schema
-- SQLite3

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('admin','faculty','student')),
    avatar_path     TEXT,
    mfa_enabled     INTEGER DEFAULT 0,
    mfa_secret      TEXT,
    is_active       INTEGER DEFAULT 1,
    must_reset_pw   INTEGER DEFAULT 0,
    onedrive_email  TEXT,
    onedrive_linked INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT UNIQUE NOT NULL,
    expires_at      TEXT NOT NULL,
    used            INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token   TEXT UNIQUE NOT NULL,
    ip_address      TEXT,
    user_agent      TEXT,
    expires_at      TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- COURSES & ENROLLMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS courses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    faculty_id      INTEGER NOT NULL REFERENCES users(id),
    semester        TEXT,
    is_published    INTEGER DEFAULT 0,
    max_students    INTEGER DEFAULT 50,
    color           TEXT DEFAULT '#4A90D9',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enrollments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT DEFAULT 'active' CHECK(status IN ('active','dropped','completed')),
    enrolled_at     TEXT DEFAULT (datetime('now')),
    UNIQUE(course_id, student_id)
);

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS announcements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    author_id       INTEGER NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    is_pinned       INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- COURSE MATERIALS & FILES
-- ============================================================

CREATE TABLE IF NOT EXISTS material_folders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    parent_id       INTEGER REFERENCES material_folders(id),
    name            TEXT NOT NULL,
    sort_order      INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS materials (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    folder_id       INTEGER REFERENCES material_folders(id),
    title           TEXT NOT NULL,
    description     TEXT,
    material_type   TEXT NOT NULL CHECK(material_type IN ('file','link','text')),
    file_path       TEXT,
    file_name       TEXT,
    file_size       INTEGER,
    mime_type       TEXT,
    url             TEXT,
    content         TEXT,
    sort_order      INTEGER DEFAULT 0,
    is_visible      INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- ASSIGNMENTS & SUBMISSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    due_date        TEXT,
    points          REAL DEFAULT 100,
    assignment_type TEXT DEFAULT 'file' CHECK(assignment_type IN ('file','text','both')),
    allow_late      INTEGER DEFAULT 0,
    late_penalty    REAL DEFAULT 0,
    is_visible      INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id   INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT,
    file_path       TEXT,
    file_name       TEXT,
    submitted_at    TEXT DEFAULT (datetime('now')),
    is_late         INTEGER DEFAULT 0,
    grade           REAL,
    feedback        TEXT,
    graded_by       INTEGER REFERENCES users(id),
    graded_at       TEXT,
    UNIQUE(assignment_id, student_id)
);

-- ============================================================
-- EXAMS & PROCTORING
-- ============================================================

CREATE TABLE IF NOT EXISTS exams (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    exam_type       TEXT DEFAULT 'quiz' CHECK(exam_type IN ('quiz','midterm','final','practice')),
    duration_minutes INTEGER NOT NULL,
    total_points    REAL NOT NULL,
    start_window    TEXT,
    end_window      TEXT,
    shuffle_questions INTEGER DEFAULT 0,
    shuffle_options INTEGER DEFAULT 0,
    show_results    TEXT DEFAULT 'after_submit' CHECK(show_results IN ('never','after_submit','after_deadline')),
    max_attempts    INTEGER DEFAULT 1,
    proctor_enabled INTEGER DEFAULT 0,
    require_webcam  INTEGER DEFAULT 0,
    detect_tab_switch INTEGER DEFAULT 1,
    detect_copy_paste INTEGER DEFAULT 1,
    lockdown_browser INTEGER DEFAULT 0,
    max_violations  INTEGER DEFAULT 5,
    is_published    INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id         INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_type   TEXT NOT NULL CHECK(question_type IN ('mcq','true_false','short_answer','essay')),
    question_text   TEXT NOT NULL,
    points          REAL NOT NULL,
    sort_order      INTEGER DEFAULT 0,
    options         TEXT,
    correct_answer  TEXT,
    word_limit      INTEGER,
    rubric          TEXT
);

CREATE TABLE IF NOT EXISTS exam_attempts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id         INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at      TEXT DEFAULT (datetime('now')),
    submitted_at    TEXT,
    time_remaining  INTEGER,
    status          TEXT DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted','graded','flagged')),
    total_score     REAL,
    auto_submitted  INTEGER DEFAULT 0,
    violation_count INTEGER DEFAULT 0,
    ip_address      TEXT
);

CREATE TABLE IF NOT EXISTS exam_answers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id      INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id     INTEGER NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    answer_text     TEXT,
    is_correct      INTEGER,
    score           REAL,
    feedback        TEXT,
    answered_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proctor_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id      INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL CHECK(event_type IN (
        'tab_switch','copy_paste','right_click','webcam_off',
        'face_not_detected','multiple_faces','screen_resize',
        'devtools_open','fullscreen_exit'
    )),
    details         TEXT,
    screenshot_path TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- MESSAGING
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subject         TEXT,
    course_id       INTEGER REFERENCES courses(id),
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_participants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at    TEXT,
    UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL REFERENCES users(id),
    body            TEXT NOT NULL,
    attachment_path TEXT,
    attachment_name TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- DISCUSSION FORUMS
-- ============================================================

CREATE TABLE IF NOT EXISTS forum_threads (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    author_id       INTEGER NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    is_pinned       INTEGER DEFAULT 0,
    is_locked       INTEGER DEFAULT 0,
    view_count      INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forum_posts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id       INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_id       INTEGER NOT NULL REFERENCES users(id),
    parent_id       INTEGER REFERENCES forum_posts(id),
    body            TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- GRADES & ANALYTICS
-- ============================================================

CREATE TABLE IF NOT EXISTS grade_categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    weight          REAL NOT NULL,
    sort_order      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS grade_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    category_id     INTEGER REFERENCES grade_categories(id),
    title           TEXT NOT NULL,
    points_possible REAL NOT NULL,
    source_type     TEXT CHECK(source_type IN ('assignment','exam','manual')),
    source_id       INTEGER,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grades (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    grade_item_id   INTEGER NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points_earned   REAL,
    letter_grade    TEXT,
    notes           TEXT,
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(grade_item_id, student_id)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    body            TEXT,
    link            TEXT,
    is_read         INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    action          TEXT NOT NULL,
    resource_type   TEXT,
    resource_id     INTEGER,
    ip_address      TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- CAF (Course Assessment File)
-- ============================================================

CREATE TABLE IF NOT EXISTS caf_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    caf_type TEXT NOT NULL CHECK(caf_type IN ('course','oct')),
    semester TEXT,
    academic_year TEXT,
    instructor_id INTEGER NOT NULL REFERENCES users(id),
    crn TEXT,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','in_progress','completed','submitted','approved')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS caf_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caf_id INTEGER NOT NULL REFERENCES caf_files(id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,
    section_name TEXT NOT NULL,
    section_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'empty' CHECK(status IN ('empty','in_progress','completed')),
    data TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS caf_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caf_id INTEGER NOT NULL REFERENCES caf_files(id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,
    title TEXT NOT NULL,
    file_path TEXT,
    file_name TEXT,
    file_size INTEGER,
    mime_type TEXT,
    doc_type TEXT DEFAULT 'general',
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS caf_student_grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caf_id INTEGER NOT NULL REFERENCES caf_files(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    component TEXT NOT NULL,
    item_name TEXT,
    score REAL,
    max_score REAL,
    clo_number INTEGER,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_caf_files_course ON caf_files(course_id);
CREATE INDEX IF NOT EXISTS idx_caf_sections_caf ON caf_sections(caf_id);
CREATE INDEX IF NOT EXISTS idx_caf_documents_caf ON caf_documents(caf_id);
CREATE INDEX IF NOT EXISTS idx_caf_grades_caf ON caf_student_grades(caf_id);

-- ============================================================
-- ATTENDANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session_date TEXT NOT NULL,
    session_type TEXT DEFAULT 'lecture' CHECK(session_type IN ('lecture','lab','tutorial','exam')),
    topic TEXT,
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'present' CHECK(status IN ('present','absent','late','excused')),
    check_in_time TEXT,
    notes TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_course ON attendance_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records(student_id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student ON exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_proctor_events_attempt ON proctor_events(attempt_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_course ON forum_threads(course_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_thread ON forum_posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_announcements_course ON announcements(course_id);
