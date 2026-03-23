# ADPOLY Blackboard - Deploy to adpolyblackboard.com

## Step 1: Push Code to GitHub (One-Time, 2 minutes)

Open a terminal and run these commands:

```bash
cd C:\Users\drkaz\Desktop\BB_ADPOLY

# Login to GitHub (a browser will open)
C:\Users\drkaz\Desktop\gh_cli\bin\gh.exe auth login

# Create the repository and push
C:\Users\drkaz\Desktop\gh_cli\bin\gh.exe repo create adpoly-blackboard --public --source=. --push
```

## Step 2: Deploy on Render.com (One-Time, 5 minutes)

1. Go to **https://render.com** and sign up (free, use GitHub login)
2. Click **"New" > "Web Service"**
3. Connect your GitHub account and select **"adpoly-blackboard"** repo
4. Settings will auto-fill from render.yaml:
   - **Name**: adpoly-blackboard
   - **Runtime**: Python
   - **Build Command**: `pip install -r requirements.txt && python seed.py`
   - **Start Command**: `gunicorn run:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
5. Click **"Deploy"**
6. Wait 3-5 minutes for deployment
7. You'll get a URL like: `https://adpoly-blackboard.onrender.com`

## Step 3: Connect Your Domain (One-Time, 10 minutes)

### In Render Dashboard:
1. Go to your deployed service
2. Click **"Settings"** > **"Custom Domains"**
3. Click **"Add Custom Domain"**
4. Enter: **adpolyblackboard.com**
5. Also add: **www.adpolyblackboard.com**
6. Render will show you DNS records to add

### In Your Domain Registrar (where you bought adpolyblackboard.com):
1. Go to DNS settings
2. Add these records:

| Type  | Name | Value                              |
|-------|------|------------------------------------|
| CNAME | @    | adpoly-blackboard.onrender.com     |
| CNAME | www  | adpoly-blackboard.onrender.com     |

**If CNAME on root (@) is not supported**, use:
| Type | Name | Value          |
|------|------|----------------|
| A    | @    | 216.24.57.1    |
| CNAME| www  | adpoly-blackboard.onrender.com |

3. Wait 5-30 minutes for DNS propagation
4. Render will auto-provision SSL certificate

## Done!

After DNS propagation, **https://adpolyblackboard.com** will be live!

### Login Credentials:
- **Admin**: admin@adpoly.ac.ae / Admin@123
- **Faculty**: (any ACTVET email) / Faculty@123
- **Student**: student1@adpoly.ac.ae / Student@123
