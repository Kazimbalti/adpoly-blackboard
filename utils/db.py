import sqlite3
import os
from flask import g, current_app


def get_db():
    if 'db' not in g:
        db_path = current_app.config['DATABASE']
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        g.db = sqlite3.connect(db_path)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def query(sql, params=()):
    rows = get_db().execute(sql, params).fetchall()
    return [dict(row) for row in rows]


def query_one(sql, params=()):
    row = get_db().execute(sql, params).fetchone()
    return dict(row) if row else None


def execute(sql, params=()):
    db = get_db()
    cursor = db.execute(sql, params)
    db.commit()
    return cursor.lastrowid


def execute_many(sql, params_list):
    db = get_db()
    db.executemany(sql, params_list)
    db.commit()


def init_db():
    db = get_db()
    base_dir = os.path.dirname(os.path.dirname(__file__))
    schema_path = os.path.join(base_dir, 'database', 'schema.sql')
    with open(schema_path, 'r') as f:
        db.executescript(f.read())

    # Ensure submissions table exists (may have been dropped during migration)
    sub_exists = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='submissions'").fetchone()
    if not sub_exists:
        db.execute("""CREATE TABLE submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT, file_path TEXT, file_name TEXT,
            submitted_at TEXT DEFAULT (datetime('now')),
            is_late INTEGER DEFAULT 0, grade REAL, feedback TEXT,
            graded_by INTEGER REFERENCES users(id), graded_at TEXT,
            attempt_number INTEGER DEFAULT 1, ai_draft_score REAL,
            faculty_confirmed INTEGER DEFAULT 0, ip_address TEXT, user_agent TEXT)""")
        db.execute("CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id)")
        db.commit()

    # Run migrations safely (each ALTER TABLE may fail if column already exists)
    migration_path = os.path.join(base_dir, 'database', 'migration_v2.sql')
    if os.path.exists(migration_path):
        with open(migration_path, 'r') as f:
            migration_sql = f.read()
        for statement in migration_sql.split(';'):
            statement = statement.strip()
            if not statement or statement.startswith('--') or statement.startswith('PRAGMA'):
                continue
            try:
                db.execute(statement)
                db.commit()
            except Exception:
                # Column/table already exists - skip
                pass
