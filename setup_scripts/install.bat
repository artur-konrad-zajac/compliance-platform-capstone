@echo off
cd /d "%~dp0\.."
echo Installing Python dependencies for compliance-api...
cd compliance-api
call uv sync
cd ..

echo Installing Node.js dependencies for compliance-platform...
cd compliance-platform
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo Created .env from .env.example
)
call npm install
cd ..

echo Configuring Google Cloud APIs and IAM roles...
FOR /F "tokens=*" %%g IN ('gcloud config get-value project') do (SET GCP_PROJECT=%%g)
FOR /F "tokens=*" %%g IN ('gcloud config get-value account') do (SET GCP_ACCOUNT=%%g)

if "%GCP_PROJECT%"=="" (
    echo WARNING: Could not detect active GCP project. Skipping telemetry setup.
    echo WARNING: Please run 'gcloud auth login' and 'gcloud config set project ^<PROJECT_ID^>' manually.
    goto end
)

echo Enabling required APIs for project: %GCP_PROJECT%
call gcloud services enable aiplatform.googleapis.com firestore.googleapis.com storage.googleapis.com cloudtrace.googleapis.com logging.googleapis.com --project="%GCP_PROJECT%"

echo Initializing Firestore Database and Cloud Storage Bucket...
call gcloud firestore databases create --location=eur3 --type=firestore-native --project="%GCP_PROJECT%" 2>nul
call gcloud storage buckets create gs://%GCP_PROJECT%-compliance-config --location=europe-central2 --project="%GCP_PROJECT%" 2>nul

echo Granting telemetry roles to: %GCP_ACCOUNT%
call gcloud projects add-iam-policy-binding "%GCP_PROJECT%" --member="user:%GCP_ACCOUNT%" --role="roles/cloudtrace.agent" --condition=None
call gcloud projects add-iam-policy-binding "%GCP_PROJECT%" --member="user:%GCP_ACCOUNT%" --role="roles/logging.logWriter" --condition=None

echo Creating Deployment Service Accounts...
call gcloud iam service-accounts create compliance-api-sa --display-name="Compliance API Service Account" --project="%GCP_PROJECT%" 2>nul
call gcloud iam service-accounts create compliance-frontend-sa --display-name="Compliance Frontend Service Account" --project="%GCP_PROJECT%" 2>nul

echo Granting required IAM roles to the backend service account...
set SA_EMAIL=compliance-api-sa@%GCP_PROJECT%.iam.gserviceaccount.com
call gcloud projects add-iam-policy-binding "%GCP_PROJECT%" --member="serviceAccount:%SA_EMAIL%" --role="roles/aiplatform.user" --condition=None
call gcloud projects add-iam-policy-binding "%GCP_PROJECT%" --member="serviceAccount:%SA_EMAIL%" --role="roles/datastore.user" --condition=None
call gcloud projects add-iam-policy-binding "%GCP_PROJECT%" --member="serviceAccount:%SA_EMAIL%" --role="roles/storage.objectAdmin" --condition=None
call gcloud projects add-iam-policy-binding "%GCP_PROJECT%" --member="serviceAccount:%SA_EMAIL%" --role="roles/logging.logWriter" --condition=None
call gcloud projects add-iam-policy-binding "%GCP_PROJECT%" --member="serviceAccount:%SA_EMAIL%" --role="roles/cloudtrace.agent" --condition=None

:end
echo Installation complete!
