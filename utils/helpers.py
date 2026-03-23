from datetime import datetime, timezone
import uuid
import re


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')


def generate_uuid():
    return str(uuid.uuid4())


def slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text


def format_file_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"


def parse_datetime(dt_string):
    if not dt_string:
        return None
    try:
        return datetime.fromisoformat(dt_string)
    except ValueError:
        return None


def time_ago(dt_string):
    if not dt_string:
        return "Unknown"
    dt = parse_datetime(dt_string)
    if not dt:
        return dt_string
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return "Just now"
    elif seconds < 3600:
        m = seconds // 60
        return f"{m} minute{'s' if m > 1 else ''} ago"
    elif seconds < 86400:
        h = seconds // 3600
        return f"{h} hour{'s' if h > 1 else ''} ago"
    elif seconds < 604800:
        d = seconds // 86400
        return f"{d} day{'s' if d > 1 else ''} ago"
    return dt.strftime('%b %d, %Y')
