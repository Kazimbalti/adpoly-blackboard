-- BB_ADPOLY LMS - Migration V2
-- Adds: New question types, deadline enforcement, multiple attempts,
--        projects with phases, labs, enhanced assignments, notifications

PRAGMA foreign_keys=ON;

-- ============================================================
-- EXAMS: Add grade recording and deadline fields
-- ============================================================

-- grade_recording: how to calculate final grade when multiple attempts allowed
ALTER TABLE exams ADD COLUMN grade_recording TEXT DEFAULT 'best' CHECK(grade_recording IN ('best','last','average'));

-- Expand question_type constraint by recreating exam_questions
-- SQLite doesn't support ALTER CHECK, so we handle this in app logic instead
-- The app will accept all new question types; the CHECK constraint is relaxed

-- ============================================================
-- EXAM_QUESTIONS: Add fields for new question types
-- ============================================================

-- For matching questions: JSON pairs [{"left":"A","right":"1"}, ...]
ALTER TABLE exam_questions ADD COLUMN matching_pairs TEXT;

-- For ordering questions: JSON array of items in correct order
ALTER TABLE exam_questions ADD COLUMN ordering_items TEXT;

-- For fill-in-blank: JSON array of accepted answers/variants
ALTER TABLE exam_questions ADD COLUMN accepted_answers TEXT;

-- For fill-in-blank: case sensitivity toggle
ALTER TABLE exam_questions ADD COLUMN case_sensitive INTEGER DEFAULT 0;

-- For numeric: accepted value and tolerance
ALTER TABLE exam_questions ADD COLUMN numeric_answer REAL;
ALTER TABLE exam_questions ADD COLUMN numeric_tolerance REAL DEFAULT 0;

-- For image-based questions: image path
ALTER TABLE exam_questions ADD COLUMN image_path TEXT;

-- For hotspot questions: JSON regions [{x,y,width,height}, ...]
ALTER TABLE exam_questions ADD COLUMN hotspot_regions TEXT;

-- For file upload answers: allowed file types (comma separated)
ALTER TABLE exam_questions ADD COLUMN allowed_file_types TEXT;

-- For multiple-answer MCQ: partial credit toggle
ALTER TABLE exam_questions ADD COLUMN partial_credit INTEGER DEFAULT 0;

-- For multiple-answer MCQ: JSON array of correct options
ALTER TABLE exam_questions ADD COLUMN correct_answers TEXT;

-- For short answer: AI keyword list for draft scoring
ALTER TABLE exam_questions ADD COLUMN keywords TEXT;

-- For essay: min/max word count
ALTER TABLE exam_questions ADD COLUMN word_limit_min INTEGER DEFAULT 0;

-- ============================================================
-- EXAM_ANSWERS: Add fields for file uploads and AI draft scoring
-- ============================================================

ALTER TABLE exam_answers ADD COLUMN file_path TEXT;
ALTER TABLE exam_answers ADD COLUMN file_name TEXT;
ALTER TABLE exam_answers ADD COLUMN ai_draft_score REAL;
ALTER TABLE exam_answers ADD COLUMN faculty_confirmed INTEGER DEFAULT 0;

-- ============================================================
-- EXAM_ATTEMPTS: Add user agent tracking
-- ============================================================

ALTER TABLE exam_attempts ADD COLUMN user_agent TEXT;
ALTER TABLE exam_attempts ADD COLUMN attempt_number INTEGER DEFAULT 1;

-- ============================================================
-- ASSIGNMENTS: Add resubmission and enhanced deadline fields
-- ============================================================

ALTER TABLE assignments ADD COLUMN max_attempts INTEGER DEFAULT 1;
ALTER TABLE assignments ADD COLUMN grade_recording TEXT DEFAULT 'last' CHECK(grade_recording IN ('best','last','average'));
ALTER TABLE assignments ADD COLUMN late_window_hours INTEGER DEFAULT 0;
ALTER TABLE assignments ADD COLUMN late_penalty_per_day REAL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN rubric TEXT;
ALTER TABLE assignments ADD COLUMN answer_key TEXT;
ALTER TABLE assignments ADD COLUMN available_from TEXT;

-- ============================================================
-- SUBMISSIONS: Allow multiple submissions per student
-- The table is recreated in init_db code if needed
-- Just add new columns if table exists with old schema
-- ============================================================

ALTER TABLE submissions ADD COLUMN attempt_number INTEGER DEFAULT 1;
ALTER TABLE submissions ADD COLUMN ai_draft_score REAL;
ALTER TABLE submissions ADD COLUMN faculty_confirmed INTEGER DEFAULT 0;
ALTER TABLE submissions ADD COLUMN ip_address TEXT;
ALTER TABLE submissions ADD COLUMN user_agent TEXT;

-- ============================================================
-- PROJECTS: New module with multi-phase support
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    total_points    REAL DEFAULT 100,
    is_visible      INTEGER DEFAULT 1,
    is_published    INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_phases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_name      TEXT NOT NULL,
    description     TEXT,
    due_date        TEXT,
    points          REAL DEFAULT 0,
    weight          REAL DEFAULT 0,
    sort_order      INTEGER DEFAULT 0,
    allow_late      INTEGER DEFAULT 0,
    late_window_hours INTEGER DEFAULT 0,
    late_penalty_per_day REAL DEFAULT 0,
    max_attempts    INTEGER DEFAULT 1,
    grade_recording TEXT DEFAULT 'last' CHECK(grade_recording IN ('best','last','average')),
    submission_type TEXT DEFAULT 'file' CHECK(submission_type IN ('file','text','both')),
    rubric          TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_submissions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_id        INTEGER NOT NULL REFERENCES project_phases(id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_number  INTEGER DEFAULT 1,
    content         TEXT,
    file_path       TEXT,
    file_name       TEXT,
    submitted_at    TEXT DEFAULT (datetime('now')),
    is_late         INTEGER DEFAULT 0,
    grade           REAL,
    feedback        TEXT,
    graded_by       INTEGER REFERENCES users(id),
    graded_at       TEXT,
    ai_draft_score  REAL,
    faculty_confirmed INTEGER DEFAULT 0,
    ip_address      TEXT,
    user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_course ON projects(course_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_project ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_submissions_phase ON project_submissions(phase_id);
CREATE INDEX IF NOT EXISTS idx_project_submissions_student ON project_submissions(student_id);

-- ============================================================
-- LABS: New module
-- ============================================================

CREATE TABLE IF NOT EXISTS labs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    lab_date        TEXT,
    due_date        TEXT,
    points          REAL DEFAULT 100,
    submission_type TEXT DEFAULT 'file' CHECK(submission_type IN ('file','text','both')),
    allow_late      INTEGER DEFAULT 0,
    late_window_hours INTEGER DEFAULT 0,
    late_penalty_per_day REAL DEFAULT 0,
    max_attempts    INTEGER DEFAULT 1,
    grade_recording TEXT DEFAULT 'last' CHECK(grade_recording IN ('best','last','average')),
    is_visible      INTEGER DEFAULT 1,
    rubric          TEXT,
    has_quiz        INTEGER DEFAULT 0,
    quiz_exam_id    INTEGER REFERENCES exams(id),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lab_submissions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    lab_id          INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_number  INTEGER DEFAULT 1,
    content         TEXT,
    file_path       TEXT,
    file_name       TEXT,
    submitted_at    TEXT DEFAULT (datetime('now')),
    is_late         INTEGER DEFAULT 0,
    grade           REAL,
    feedback        TEXT,
    graded_by       INTEGER REFERENCES users(id),
    graded_at       TEXT,
    ip_address      TEXT,
    user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_labs_course ON labs(course_id);
CREATE INDEX IF NOT EXISTS idx_lab_submissions_lab ON lab_submissions(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_submissions_student ON lab_submissions(student_id);

-- ============================================================
-- NOTIFICATIONS: Add type field for categorization
-- ============================================================

ALTER TABLE notifications ADD COLUMN notif_type TEXT DEFAULT 'general';
ALTER TABLE notifications ADD COLUMN resource_type TEXT;
ALTER TABLE notifications ADD COLUMN resource_id INTEGER;
