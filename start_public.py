"""Start BB ADPOLY LMS with a free public URL using Cloudflare tunnel."""
import os
import sys
import threading
import time

def main():
    # First ensure the server is running
    os.environ['FLASK_ENV'] = 'production'

    from app import create_app

    app = create_app()

    print("\n" + "=" * 60)
    print("  BB ADPOLY - Learning Management System")
    print("  Starting with PUBLIC access...")
    print("=" * 60)

    try:
        from flask_cloudflared import run_with_cloudflared
        run_with_cloudflared(app)
        print("\n  A FREE public URL will appear below.")
        print("  Share it with faculty and students!\n")
    except ImportError:
        print("\n  flask-cloudflared not found.")
        print("  Install it: pip install flask-cloudflared")
        print("  Falling back to localhost only.\n")
    except Exception as e:
        print(f"\n  Cloudflare tunnel setup: {e}")
        print("  Falling back to localhost.\n")

    print("  Login Credentials:")
    print("  " + "-" * 50)
    print("  Admin:   admin@adpoly.ac.ae / Admin@123")
    print("  Faculty: (any ACTVET email)  / Faculty@123")
    print("  Student: student1@adpoly.ac.ae / Student@123")
    print("=" * 60 + "\n")

    app.run(host='0.0.0.0', port=5000, debug=False)


if __name__ == '__main__':
    main()
