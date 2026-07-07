#!/bin/bash
# Usage: ./setup_scripts/deploy.sh [web|api|both]

TARGET=$1

if [ -z "$TARGET" ] || ([ "$TARGET" != "web" ] && [ "$TARGET" != "api" ] && [ "$TARGET" != "both" ]); then
    echo "Usage: ./setup_scripts/deploy.sh [web|api|both]"
    exit 1
fi

cd "$(dirname "$0")/.." || exit

GCP_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ -z "$GCP_PROJECT" ]; then
    echo "WARNING: Could not detect active GCP project. Please run 'gcloud auth login' and 'gcloud config set project <PROJECT_ID>'."
    exit 1
fi

deploy_api() {
    echo "=========================================="
    echo "Deploying Backend API to Cloud Run..."
    echo "=========================================="
    cd compliance-api || exit
    gcloud run deploy compliance-platform-api \
      --source . \
      --region europe-central2 \
      --allow-unauthenticated \
      --no-cpu-throttling \
      --timeout=3600 \
      --service-account "compliance-api-sa@${GCP_PROJECT}.iam.gserviceaccount.com" \
      --set-env-vars "GOOGLE_CLOUD_PROJECT=${GCP_PROJECT}"
    cd ..
}

deploy_web() {
    echo "=========================================="
    echo "Deploying Frontend Web to Cloud Run..."
    echo "=========================================="
    
    API_URL=$(gcloud run services describe compliance-platform-api --region europe-central2 --format="value(status.url)" 2>/dev/null)
    if [ -z "$API_URL" ]; then
        echo "ERROR: Could not find backend API URL. Please deploy 'api' first."
        exit 1
    fi

    cd compliance-platform || exit
    echo "VITE_API_URL=${API_URL}" > .env.production
    gcloud run deploy compliance-platform-web \
      --source . \
      --region europe-central2 \
      --allow-unauthenticated \
      --service-account "compliance-frontend-sa@${GCP_PROJECT}.iam.gserviceaccount.com"
    rm -f .env.production
    cd ..
}

if [ "$TARGET" == "both" ]; then
    deploy_api
    deploy_web
elif [ "$TARGET" == "api" ]; then
    deploy_api
elif [ "$TARGET" == "web" ]; then
    deploy_web
fi

echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
