@echo off
set TARGET=%1

if "%TARGET%"=="" goto :usage
if /I "%TARGET%"=="web" goto :start
if /I "%TARGET%"=="api" goto :start
if /I "%TARGET%"=="both" goto :start

:usage
echo Usage: deploy.bat [web^|api^|both]
exit /b 1

:start
cd /d "%~dp0.."

FOR /F "tokens=*" %%g IN ('gcloud config get-value project 2^>nul') do (SET GCP_PROJECT=%%g)

if "%GCP_PROJECT%"=="" (
    echo WARNING: Could not detect active GCP project. Please run 'gcloud auth login' and 'gcloud config set project ^<PROJECT_ID^>'.
    exit /b 1
)

if /I "%TARGET%"=="both" goto :deploy_both
if /I "%TARGET%"=="api" call :deploy_api
if /I "%TARGET%"=="web" call :deploy_web

echo ==========================================
echo Deployment complete!
echo ==========================================
exit /b 0

:deploy_both
call :deploy_api
call :deploy_web
exit /b 0

:deploy_api
echo ==========================================
echo Deploying Backend API to Cloud Run...
echo ==========================================
cd compliance-api
call gcloud run deploy compliance-platform-api --source . --region europe-central2 --allow-unauthenticated --no-cpu-throttling --timeout=3600 --service-account compliance-api-sa@%GCP_PROJECT%.iam.gserviceaccount.com --set-env-vars GOOGLE_CLOUD_PROJECT=%GCP_PROJECT%
cd ..
exit /b 0

:deploy_web
echo ==========================================
echo Deploying Frontend Web to Cloud Run...
echo ==========================================
FOR /F "tokens=*" %%g IN ('gcloud run services describe compliance-platform-api --region europe-central2 --format="value(status.url)" 2^>nul') do (SET API_URL=%%g)
if "%API_URL%"=="" (
    echo ERROR: Could not find backend API URL. Please deploy 'api' first.
    exit /b 1
)
cd compliance-platform
echo VITE_API_URL=%API_URL%> .env.production
call gcloud run deploy compliance-platform-web --source . --region europe-central2 --allow-unauthenticated --service-account compliance-frontend-sa@%GCP_PROJECT%.iam.gserviceaccount.com
del .env.production
cd ..
exit /b 0
