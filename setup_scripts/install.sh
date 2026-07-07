#!/bin/bash
cd "$(dirname "$0")/.." || exit
echo "Installing Python dependencies for compliance-api..."
cd compliance-api || exit
uv sync
cd ..

echo "Installing Node.js dependencies for compliance-platform..."
cd compliance-platform || exit
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
fi
npm install
cd ..

echo "Configuring Google Cloud APIs and IAM roles..."
GCP_PROJECT=$(gcloud config get-value project 2>/dev/null)
GCP_ACCOUNT=$(gcloud config get-value account 2>/dev/null)

if [ -z "$GCP_PROJECT" ] || [ -z "$GCP_ACCOUNT" ]; then
    echo "WARNING: Could not detect active GCP project or account. Skipping telemetry setup."
    echo "WARNING: Please run 'gcloud auth login' and 'gcloud config set project <PROJECT_ID>' manually."
else
    echo "Enabling required APIs for project: $GCP_PROJECT"
    gcloud services enable aiplatform.googleapis.com firestore.googleapis.com storage.googleapis.com cloudtrace.googleapis.com logging.googleapis.com --project="$GCP_PROJECT"

    echo "Initializing Firestore Database and Cloud Storage Bucket..."
    gcloud firestore databases create --location=eur3 --type=firestore-native --project="$GCP_PROJECT" 2>/dev/null || true
    gcloud storage buckets create gs://${GCP_PROJECT}-compliance-config --location=europe-central2 --project="$GCP_PROJECT" 2>/dev/null || true

    echo "Granting telemetry roles to: $GCP_ACCOUNT"
    gcloud projects add-iam-policy-binding "$GCP_PROJECT" --member="user:$GCP_ACCOUNT" --role="roles/cloudtrace.agent" --condition=None
    gcloud projects add-iam-policy-binding "$GCP_PROJECT" --member="user:$GCP_ACCOUNT" --role="roles/logging.logWriter" --condition=None

    echo "Creating Deployment Service Accounts..."
    gcloud iam service-accounts create compliance-api-sa --display-name="Compliance API Service Account" --project="$GCP_PROJECT" 2>/dev/null || true
    gcloud iam service-accounts create compliance-frontend-sa --display-name="Compliance Frontend Service Account" --project="$GCP_PROJECT" 2>/dev/null || true

    echo "Granting required IAM roles to the backend service account..."
    SA_EMAIL="compliance-api-sa@${GCP_PROJECT}.iam.gserviceaccount.com"
    gcloud projects add-iam-policy-binding "$GCP_PROJECT" --member="serviceAccount:$SA_EMAIL" --role="roles/aiplatform.user" --condition=None
    gcloud projects add-iam-policy-binding "$GCP_PROJECT" --member="serviceAccount:$SA_EMAIL" --role="roles/datastore.user" --condition=None
    gcloud projects add-iam-policy-binding "$GCP_PROJECT" --member="serviceAccount:$SA_EMAIL" --role="roles/storage.objectAdmin" --condition=None
    gcloud projects add-iam-policy-binding "$GCP_PROJECT" --member="serviceAccount:$SA_EMAIL" --role="roles/logging.logWriter" --condition=None
    gcloud projects add-iam-policy-binding "$GCP_PROJECT" --member="serviceAccount:$SA_EMAIL" --role="roles/cloudtrace.agent" --condition=None
fi

echo "Installation complete!"
