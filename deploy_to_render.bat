@echo off
echo ============================================================
echo   ADPOLY Blackboard - Deploy to adpolyblackboard.com
echo ============================================================
echo.

REM Step 1: Login to GitHub
echo [Step 1/3] Logging into GitHub...
echo A browser window will open. Please sign in with your GitHub account.
echo.
C:\Users\drkaz\Desktop\gh_cli\bin\gh.exe auth login --web
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: GitHub login failed. Please try again.
    pause
    exit /b 1
)
echo GitHub login successful!
echo.

REM Step 2: Create repo and push
echo [Step 2/3] Creating GitHub repository and pushing code...
cd /d C:\Users\drkaz\Desktop\BB_ADPOLY
C:\Users\drkaz\Desktop\gh_cli\bin\gh.exe repo create adpoly-blackboard --public --source=. --push --description "ADPOLY Blackboard LMS - adpolyblackboard.com"
if %ERRORLEVEL% NEQ 0 (
    echo Repository might already exist. Trying to push...
    git remote add origin https://github.com/%USERNAME%/adpoly-blackboard.git 2>nul
    git push -u origin master
)
echo Code pushed to GitHub!
echo.

REM Step 3: Instructions for Render
echo [Step 3/3] Code is on GitHub! Now deploy on Render.com:
echo.
echo   1. Open: https://render.com
echo   2. Sign up with your GitHub account (FREE)
echo   3. Click "New" then "Web Service"
echo   4. Select the "adpoly-blackboard" repository
echo   5. Everything auto-configures from render.yaml
echo   6. Click "Deploy" and wait 3-5 minutes
echo.
echo   Then add your domain:
echo   7. Go to Settings ^> Custom Domains
echo   8. Add: adpolyblackboard.com
echo   9. Update your DNS records as shown
echo.
echo ============================================================
echo   Your LMS will be live at: https://adpolyblackboard.com
echo ============================================================
echo.

REM Open Render in browser
start https://render.com/deploy

pause
