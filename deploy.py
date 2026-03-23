"""
BB ADPOLY LMS - Public Deployment Helper

This script helps you deploy the LMS to a free public URL.

Option 1: Render.com (RECOMMENDED - Free, Persistent)
  1. Go to https://render.com and sign up (free)
  2. Connect your GitHub account
  3. Push this project to GitHub
  4. Create a new "Web Service" on Render
  5. Select your repository
  6. It auto-detects the render.yaml configuration
  7. Click "Deploy" - you'll get a free URL like: https://bb-adpoly-lms.onrender.com

Option 2: PythonAnywhere (Free, Persistent)
  1. Go to https://www.pythonanywhere.com and sign up (free)
  2. Upload the project files
  3. Set up a Web app (Flask, Python 3.11)
  4. You'll get: https://yourusername.pythonanywhere.com

Option 3: Railway.app (Free tier, Easy)
  1. Go to https://railway.app and sign up
  2. Connect GitHub, deploy from repo
  3. You'll get a free URL

Option 4: Local tunnel with ngrok (Temporary)
  1. Sign up at https://dashboard.ngrok.com/signup (free)
  2. Get your authtoken from the dashboard
  3. Run: python deploy.py --ngrok YOUR_AUTH_TOKEN
"""

import sys
import os

def setup_ngrok(authtoken):
    """Set up ngrok tunnel for temporary public access."""
    try:
        from pyngrok import ngrok, conf
        conf.get_default().auth_token = authtoken
        tunnel = ngrok.connect(5000)
        print("\n" + "=" * 60)
        print("  BB ADPOLY LMS - PUBLIC ACCESS")
        print("=" * 60)
        print(f"\n  Your public URL: {tunnel.public_url}")
        print(f"\n  Share this link with faculty and students!")
        print(f"\n  Faculty login:  (ACTVET email) / Faculty@123")
        print(f"  Student login:  student1@adpoly.ac.ae / Student@123")
        print(f"\n  Press Ctrl+C to stop the tunnel.")
        print("=" * 60)

        # Keep alive
        import time
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down tunnel...")
            ngrok.disconnect(tunnel.public_url)
    except Exception as e:
        print(f"Error: {e}")
        print("Make sure pyngrok is installed: pip install pyngrok")

def print_instructions():
    print(__doc__)
    print("\nQuick Deploy Commands:")
    print("=" * 50)
    print("\n1. RENDER.COM (Recommended):")
    print("   git init && git add -A && git commit -m 'Initial commit'")
    print("   # Push to GitHub, then deploy from render.com dashboard")
    print()
    print("2. NGROK (Temporary):")
    print("   python deploy.py --ngrok YOUR_NGROK_AUTH_TOKEN")
    print()

if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--ngrok':
        setup_ngrok(sys.argv[2])
    else:
        print_instructions()
