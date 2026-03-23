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
    schema_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'schema.sql')
    with open(schema_path, 'r') as f:
        db.executescript(f.read())
