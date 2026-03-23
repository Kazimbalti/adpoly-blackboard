import time
from functools import wraps
from flask import request, jsonify
from collections import defaultdict

_rate_limits = defaultdict(list)


def rate_limit(max_requests=5, window_seconds=60):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            ip = request.remote_addr or 'unknown'
            key = f"{f.__name__}:{ip}"
            now = time.time()

            _rate_limits[key] = [t for t in _rate_limits[key] if now - t < window_seconds]

            if len(_rate_limits[key]) >= max_requests:
                return jsonify({"error": "Too many requests. Please try again later."}), 429

            _rate_limits[key].append(now)
            return f(*args, **kwargs)
        return decorated
    return decorator
