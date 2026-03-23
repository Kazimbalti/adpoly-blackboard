import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from flask import current_app
from utils.db import query_one, execute
from utils.security import generate_token, hash_token


def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')


def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


def create_access_token(user_id, role):
    payload = {
        'sub': str(user_id),
        'role': role,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(seconds=current_app.config['JWT_ACCESS_EXPIRY'])
    }
    return jwt.encode(payload, current_app.config['JWT_SECRET'], algorithm='HS256')


def create_refresh_token(user_id, ip_address=None, user_agent=None):
    token = generate_token(48)
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=current_app.config['JWT_REFRESH_EXPIRY'])).strftime('%Y-%m-%d %H:%M:%S')
    execute(
        "INSERT INTO sessions (user_id, refresh_token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, hash_token(token), ip_address, user_agent, expires_at)
    )
    return token


def verify_access_token(token):
    try:
        payload = jwt.decode(token, current_app.config['JWT_SECRET'], algorithms=['HS256'])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def verify_refresh_token(token):
    hashed = hash_token(token)
    session = query_one(
        "SELECT * FROM sessions WHERE refresh_token = ? AND expires_at > datetime('now')",
        (hashed,)
    )
    return session


def revoke_refresh_token(token):
    hashed = hash_token(token)
    execute("DELETE FROM sessions WHERE refresh_token = ?", (hashed,))


def revoke_all_user_sessions(user_id):
    execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def create_password_reset_token(user_id):
    token = generate_token(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S')
    execute(
        "INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)",
        (user_id, hash_token(token), expires_at)
    )
    return token


def verify_password_reset_token(token):
    hashed = hash_token(token)
    reset = query_one(
        "SELECT * FROM password_resets WHERE token = ? AND expires_at > datetime('now') AND used = 0",
        (hashed,)
    )
    return reset


def use_password_reset_token(token):
    hashed = hash_token(token)
    execute("UPDATE password_resets SET used = 1 WHERE token = ?", (hashed,))
