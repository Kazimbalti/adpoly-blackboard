import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    JWT_SECRET = os.getenv('JWT_SECRET', 'jwt-secret-key-change-in-production')
    JWT_ACCESS_EXPIRY = 900  # 15 minutes
    JWT_REFRESH_EXPIRY = 604800  # 7 days
    DATABASE = os.getenv('DATABASE', os.path.join(os.path.dirname(__file__), 'database', 'bb_adpoly.db'))
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB
    ALLOWED_EXTENSIONS = {
        'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
        'txt', 'csv', 'zip', 'rar', '7z',
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg',
        'mp4', 'avi', 'mov', 'mp3', 'wav',
        'py', 'java', 'cpp', 'c', 'js', 'html', 'css'
    }
    BCRYPT_ROUNDS = 12
    RATE_LIMIT_LOGIN = 5  # attempts per minute
