param (
    [Parameter(Mandatory=$true, HelpMessage="Choose target: web, api, or both")]
    [ValidateSet("web", "api", "both")]
    [string]$Target
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Join-Path -Path $ScriptDir -ChildPath ".."
Set-Location -Path $RootDir

$gcp_project = gcloud config get-value project 2>$null
if ([string]::IsNullOrWhiteSpace($gcp_project)) {
    Write-Warning "Could not detect active GCP project. Please run 'gcloud auth login' and 'gcloud config set project <PROJECT_ID>'."
    exit
}

function Deploy-API {
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "Deploying Backend API to Cloud Run..." -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    
    Push-Location "compliance-api"
    gcloud run deploy compliance-platform-api `
      --source . `
      --region europe-central2 `
      --allow-unauthenticated `
      --no-cpu-throttling `
      --timeout=3600 `
      --service-account compliance-api-sa@${gcp_project}.iam.gserviceaccount.com `
      --set-env-vars GOOGLE_CLOUD_PROJECT=$gcp_project
    Pop-Location
}

function Deploy-Web {
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "Deploying Frontend Web to Cloud Run..." -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    
    $api_url = gcloud run services describe compliance-platform-api --region europe-central2 --format="value(status.url)" 2>$null
    if ([string]::IsNullOrWhiteSpace($api_url)) {
        Write-Error "Could not find backend API URL. Please deploy 'api' first."
        exit 1
    }

    Push-Location "compliance-platform"
    Set-Content -Path ".env.production" -Value "VITE_API_URL=$api_url"
    gcloud run deploy compliance-platform-web `
      --source . `
      --region europe-central2 `
      --allow-unauthenticated `
      --service-account compliance-frontend-sa@${gcp_project}.iam.gserviceaccount.com
    Remove-Item -Path ".env.production" -ErrorAction SilentlyContinue
    Pop-Location
}

if ($Target -eq "both") {
    Deploy-API
    Deploy-Web
} elseif ($Target -eq "api") {
    Deploy-API
} elseif ($Target -eq "web") {
    Deploy-Web
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment complete!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
