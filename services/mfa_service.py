import pyotp
import qrcode
import io
import base64
from utils.db import execute, query_one


def generate_mfa_secret():
    return pyotp.random_base32()


def get_totp(secret):
    return pyotp.TOTP(secret)


def verify_mfa_code(secret, code):
    totp = get_totp(secret)
    return totp.verify(code, valid_window=1)


def generate_qr_code(email, secret):
    totp = get_totp(secret)
    uri = totp.provisioning_uri(name=email, issuer_name="BB ADPOLY LMS")
    qr = qrcode.QRCode(version=1, box_size=6, border=4)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def enable_mfa(user_id, secret):
    execute("UPDATE users SET mfa_enabled = 1, mfa_secret = ? WHERE id = ?", (secret, user_id))


def disable_mfa(user_id):
    execute("UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?", (user_id,))


def get_user_mfa_secret(user_id):
    user = query_one("SELECT mfa_secret FROM users WHERE id = ?", (user_id,))
    return user['mfa_secret'] if user else None
