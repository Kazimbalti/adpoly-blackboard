import hashlib
import hmac
import secrets
from flask import current_app


def generate_token(length=32):
    return secrets.token_urlsafe(length)


def generate_csrf_token():
    return secrets.token_hex(32)


def verify_csrf_token(token, stored_token):
    if not token or not stored_token:
        return False
    return hmac.compare_digest(token, stored_token)


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()
