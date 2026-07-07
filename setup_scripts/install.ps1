Set-Location -Path "$PSScriptRoot\.."
Write-Host "Installing Python dependencies for compliance-api..."
Set-Location compliance-api
uv sync
Set-Location ..

Write-Host "Installing Node.js dependencies for compliance-platform..."
Set-Location compliance-platform
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" -Destination ".env"
    Write-Host "Created .env from .env.example"
}
npm install
Set-Location ..

Write-Host "Configuring Google Cloud APIs and IAM roles..."
$gcp_project = gcloud config get-value project
$gcp_account = gcloud config get-value account

if ([string]::IsNullOrWhiteSpace($gcp_project) -or [string]::IsNullOrWhiteSpace($gcp_account)) {
    Write-Warning "Could not detect active GCP project or account. Skipping telemetry setup."
    Write-Warning "Please run 'gcloud auth login' and 'gcloud config set project <PROJECT_ID>' manually."
} else {
    Write-Host "Enabling required APIs for project: $gcp_project"
    gcloud services enable aiplatform.googleapis.com firestore.googleapis.com storage.googleapis.com cloudtrace.googleapis.com logging.googleapis.com --project="$gcp_project"

    Write-Host "Initializing Firestore Database and Cloud Storage Bucket..."
    gcloud firestore databases create --location=eur3 --type=firestore-native --project="$gcp_project" 2>$null
    gcloud storage buckets create gs://${gcp_project}-compliance-config --location=europe-central2 --project="$gcp_project" 2>$null

    Write-Host "Granting telemetry roles to: $gcp_account"
    gcloud projects add-iam-policy-binding "$gcp_project" --member="user:$gcp_account" --role="roles/cloudtrace.agent" --condition=None
    gcloud projects add-iam-policy-binding "$gcp_project" --member="user:$gcp_account" --role="roles/logging.logWriter" --condition=None

    Write-Host "Creating Deployment Service Accounts..."
    gcloud iam service-accounts create compliance-api-sa --display-name="Compliance API Service Account" --project="$gcp_project" 2>$null
    gcloud iam service-accounts create compliance-frontend-sa --display-name="Compliance Frontend Service Account" --project="$gcp_project" 2>$null

    Write-Host "Granting required IAM roles to the backend service account..."
    $sa_email = "compliance-api-sa@${gcp_project}.iam.gserviceaccount.com"
    gcloud projects add-iam-policy-binding "$gcp_project" --member="serviceAccount:$sa_email" --role="roles/aiplatform.user" --condition=None
    gcloud projects add-iam-policy-binding "$gcp_project" --member="serviceAccount:$sa_email" --role="roles/datastore.user" --condition=None
    gcloud projects add-iam-policy-binding "$gcp_project" --member="serviceAccount:$sa_email" --role="roles/storage.objectAdmin" --condition=None
    gcloud projects add-iam-policy-binding "$gcp_project" --member="serviceAccount:$sa_email" --role="roles/logging.logWriter" --condition=None
    gcloud projects add-iam-policy-binding "$gcp_project" --member="serviceAccount:$sa_email" --role="roles/cloudtrace.agent" --condition=None
}

Write-Host "Installation complete!"
