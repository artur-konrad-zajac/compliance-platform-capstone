# Compliance Platform

A full-stack compliance evaluation application utilizing Google Cloud Platform (GCP) and the Agent Development Kit (ADK) to automate compliance processes (e.g., EU AI Act). 

This project demonstrates the transition from "vibe coding" to disciplined **Agentic Engineering**, employing a robust production Harness, Zero Ambient Authority, and ADK Orchestration.

> **⚠️ WARNING:** 
> 
> * **No Authentication:** The current code implementation has no user authentication. Deploying this software on the public internet will open full access to the general public.
> * **Experimental Phase:** The whole application and agent code are in an experimental phase. The goal was to provide a proof-of-concept only.
> * **AI Form Building Process:** The AI form building process is time-consuming, as it takes into account real EU regulation documents. As a result, it might generate costs (e.g., LLM API usage) and in some cases might not be successful.

## The Architecture: The Factory Model & Harness
This application relies on a complete "Harness" around the core LLM to provide state, tool execution, feedback loops, and enforceable constraints. The ecosystem is powered by several Google Cloud services:

* **Cloud Run (Deployment & Observability)**: Hosts the production API backend (`compliance-platform-api`) and frontend.
* **Firestore (State & Orchestration)**: Acts as the system database. It manages rate limits, stores evaluation state, and powers the background job queue for long-running ADK swarm processes (replacing Cloud Tasks).
* **Cloud Storage (Memory & Knowledge)**: Used to persist generated artifacts (such as `form_schema.json`, `impact_report.md`, and compliance transcripts) isolating them per tenant/session via `instance_id`.
* **Vertex AI (Gemini)**: The underlying LLM orchestrating the ADK agents.
* **Agent Development Kit (ADK)**: The framework for orchestrating multi-agent swarms. Instead of acting as a "Conductor," the system acts as an "Orchestrator," delegating complex evaluation workflows to specialized ADK sub-agents.
* **Agent Skills (Progressive Disclosure)**: Utilizes the `agents-cli-manifest.yaml` and modular skill structures to load context on-demand, preventing context window bloat and ensuring high-fidelity execution.

## Authentication & Security: Zero Ambient Authority
We strictly enforce the **Principle of Least Privilege** by utilizing two dedicated Service Accounts rather than default developer credentials or the default Compute Engine account. This prevents the "Confused Deputy" problem by ensuring the agent never inherits ambient administrative privileges:

1. **Backend Service Account**: `compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com`
   Used strictly by the FastAPI backend to query `aiplatform`, `datastore`, and `storage`.
   **Required IAM Roles**:
   - `roles/aiplatform.user`
   - `roles/datastore.user`
   - `roles/storage.objectAdmin`
   - `roles/logging.logWriter` (Required for ADK telemetry and OpenTelemetry exports to prevent process crashes)
   - `roles/cloudtrace.agent` (Required for OpenTelemetry distributed tracing)

2. **Frontend Service Account**: `compliance-frontend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com`
   Used strictly by the Vite/React frontend container. Configured with *zero* IAM roles since it only needs to serve static web assets.

### Setting up Service Accounts from scratch
If you need to recreate this environment from scratch:
```bash
# 1. Create the Service Accounts
gcloud iam service-accounts create compliance-api-sa --display-name="Compliance API SA"
gcloud iam service-accounts create compliance-frontend-sa --display-name="Compliance Frontend SA"

# 2. Bind the necessary roles to the backend account
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/aiplatform.user" --condition=None
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/datastore.user" --condition=None
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/storage.objectAdmin" --condition=None
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/logging.logWriter" --condition=None
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/cloudtrace.agent" --condition=None
```

**Local Development**: You authenticate via `gcloud auth application-default login`. The app will inherit your personal GCP permissions instead of using the service accounts above.

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- [uv](https://github.com/astral-sh/uv) or pip
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)

### 0. GCP Project Setup
Before running the application for the first time, you must configure your local terminal to use your GCP project, enable the required APIs, and initialize the Firestore database.

```bash
# Set your active GCP project
gcloud config set project YOUR_PROJECT_ID

# Enable required Google Cloud APIs (including ADK Telemetry services)
gcloud services enable aiplatform.googleapis.com firestore.googleapis.com storage.googleapis.com cloudtrace.googleapis.com logging.googleapis.com

# Initialize the default Firestore database (choose your preferred region, e.g., europe-central2)
gcloud firestore databases create --location=europe-central2

# Create the Cloud Storage bucket for document caching
gcloud storage buckets create gs://YOUR_PROJECT_ID-compliance-config --location=europe-central2
```

> **Note on Infrastructure Auto-Creation**: You do *not* need to manually create the Firestore `config` documents (`rate_limits`, `agent_params`, `limits`). The FastAPI backend is programmed to automatically initialize the configuration documents with default values on its very first startup. If you add missing parameters to existing documents, the backend will auto-backfill them.

### 1. Authentication
Authenticate your local environment with GCP so the application can use your personal credentials for local development:
```bash
gcloud auth application-default login

# Optional: To ensure local ADK Telemetry (Cloud Trace and Logging) works without crashing, 
# grant your personal Google Account the required telemetry roles:
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="user:YOUR_GOOGLE_ACCOUNT_EMAIL" --role="roles/cloudtrace.agent" --condition=None
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="user:YOUR_GOOGLE_ACCOUNT_EMAIL" --role="roles/logging.logWriter" --condition=None
```

### 2. Manual Installation & Running
You can setup and run the application entirely from scratch using standard terminal commands without relying on the provided `.bat` or `.sh` setup scripts.

**Start the Backend (Terminal 1):**
```bash
cd compliance-api
uv sync
uv run uvicorn app.fast_api_app:app --host 0.0.0.0 --port 8000
```

**Start the Frontend (Terminal 2):**
Before starting the frontend, create a `.env` file from the example to configure your API URL:
```bash
cd compliance-platform
cp .env.example .env
npm install
npm run dev
```

### (Optional) Setup Scripts
If you prefer automation, we provide scripts to set up and run the environment.

**1. Installation (Run Once)**
This installs all dependencies and enables required GCP APIs:
- **Windows (PowerShell)**: `.\setup_scripts\install.ps1`
- **Windows (CMD)**: `setup_scripts\install.bat`
- **macOS/Linux**: `./setup_scripts/install.sh`

**2. Run Local Servers (Run Daily)**
This launches both the FastAPI backend and the React/Vite frontend concurrently for local development:
- **Windows (PowerShell)**: `.\setup_scripts\run.ps1`
- **Windows (CMD)**: `setup_scripts\run.bat`
- **macOS/Linux**: `./setup_scripts/run.sh`

## Deployment to GCP
Both the backend and the frontend are deployed to Cloud Run as containerized microservices.

> [!IMPORTANT]
> **Active GCP Project:** Whether you use the automated setup/deployment scripts or the manual deployment steps below, they will automatically target your currently active Google Cloud project. You can check which project is active by running `gcloud config get-value project` and switch projects using `gcloud config set project YOUR_PROJECT_ID`.

### Automated Deployment (Recommended)
You can deploy both the backend and frontend automatically using the provided deployment scripts. Because the frontend relies on the backend's live URL at build time, these scripts run sequentially: they dynamically deploy the backend first, seamlessly fetch the exact Cloud Run API URL assigned by Google Cloud, and inject it into the frontend build environment.

- **Windows (PowerShell)**: `.\setup_scripts\deploy.ps1 both`
- **Windows (CMD)**: `setup_scripts\deploy.bat both`
- **macOS/Linux**: `./setup_scripts/deploy.sh both`

*(You can also pass `web` or `api` instead of `both` to deploy them individually, but `api` must be deployed first.)*

### Manual Deployment
If you prefer to deploy manually or need to customize the process, follow these steps:

#### Pre-requisites: Service Accounts & IAM
Before deploying, you must create dedicated service accounts for your microservices to follow the principle of least privilege.

```bash
# Create the backend and frontend service accounts
gcloud iam service-accounts create compliance-api-sa --display-name="Compliance API Service Account"
gcloud iam service-accounts create compliance-frontend-sa --display-name="Compliance Frontend Service Account"

# Grant required IAM roles to the backend service account
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/aiplatform.user" --condition=None
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/datastore.user" --condition=None
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/storage.objectAdmin" --condition=None
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/logging.logWriter" --condition=None
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/cloudtrace.agent" --condition=None
```

### Backend Deployment
From the `compliance-api` directory:
```bash
gcloud run deploy compliance-platform-api \
  --source . \
  --region europe-central2 \
  --allow-unauthenticated \
  --no-cpu-throttling \
  --timeout=3600 \
  --service-account compliance-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
```
> **Note**: If `gcloud` prompts you to enable APIs (like Cloud Build) or create an Artifact Registry repository, type `Y` and press Enter.

### Frontend Deployment
Because the frontend is a static Vite application, it needs to know the backend URL at **build time**. 
When the backend deployment (above) finishes, the terminal will output a live Service URL (e.g., `https://compliance-platform-api-[hash].a.run.app` or `https://compliance-platform-api-[PROJECT_NUMBER].europe-central2.run.app`). 

Inside the `compliance-platform` directory, create a new file named `.env.production` and paste your backend URL into it like this:
```bash
VITE_API_URL=https://compliance-platform-api-...run.app
```

Then, run the deployment command from the `compliance-platform` directory:
```bash
gcloud run deploy compliance-platform-web \
  --source . \
  --region europe-central2 \
  --allow-unauthenticated \
  --service-account compliance-frontend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```
