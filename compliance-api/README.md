# Compliance API & Agents

> An Agentic AI Proof-of-Concept for DORA (Digital Operational Resilience Act) and NIS2 Compliance automation.

## Architecture Overview

This project implements a **Multi-Agent "Maker-Checker" Swarm** using the Google Agent Development Kit (ADK). The system is designed to automate the ingestion of new regulatory mandates (like DORA) and dynamically assess the compliance posture of Major Cloud Service Providers across the banking sector.

### Core Components

1. **Regulatory Watchdog Agent**
   - Continuously monitors governmental publications for regulatory updates (e.g., DORA Regulatory Technical Standards).
   - Generates a "Regulatory Impact Report" highlighting required changes to vendor assessment forms.

2. **Schema Generator Agent (The Maker)**
   - Receives the impact report and automatically drafts an updated `JSONSchema` for the Cloud Security Assessment form.
   - Converts legal prose into quantifiable metrics (e.g., specific RTO/RPO requirements instead of boolean questions).

3. **Human Review Critic (The Checker)**
   - Acts as the final quality gate. It verifies the proposed schema against the source text.
   - Ensures no hallucinations were introduced and validates mapping logic.
   - Approves the deployment of the new schema to the frontend.

4. **Applicant Chat Assistant**
   - An interactive conversational agent (`compliance_chat_agent`) embedded directly in the form UI.
   - Guides the applicant through complex regulatory questions using the underlying form schema and DORA text.
   - Preserves chat history and context.

5. **Auto-Fill AI Agent**
   - Automatically parses uploaded compliance evidence (e.g., .txt documents) and maps findings to the required `JSONSchema` fields.
   - Handles complex mapping tasks, including dynamic lists, with exact citations to the source document.
   - Protected by the **Document Security Guard** agent, which intercepts and sanitizes uploaded documents to prevent prompt injection or malicious instructions before passing data to the Auto-Fill agent.

6. **Concentration Risk Swarm (Mocked External Integration)**
   - A specialized sub-agent that takes the newly generated form data (e.g., lists of 3rd party sub-contractors) and queries external Threat Intelligence APIs.
   - Evaluates systemic concentration risk across the banking sector.

## How It Works

1. **The Catalyst:** An updated DORA RTS document is fed into the system.
2. **The Analysis:** The Watchdog Agent identifies that legacy forms only ask "Do you have a BCDR plan?" but the new regulation requires exact hours for RTO (Recovery Time Objective) and RPO (Recovery Point Objective).
3. **The Update:** The Schema Generator proposes new data fields: `q3_rto_hours`, `q4_rpo_hours`, `q5_encryption_type` (CMEK), and `q6_sub_contractors`.
4. **The Review:** The Human Review Critic validates these fields, ensuring legal traceability.
5. **The Frontend:** The React UI (`compliance-platform`) syncs these changes via the `/api/trigger-regulatory-update` endpoint, dynamically rendering the new requirements for Cloud Providers.

## Technologies Used

* **Google Agent Development Kit (ADK):** Multi-agent orchestration, state management, and async generation.
* **Gemini 1.5 Flash:** Core LLM reasoning engine for legal analysis.
* **FastAPI:** Python backend serving the multi-agent workflows.
* **React / Vite / TailwindCSS:** Frontend interface displaying the DORA synchronization panel.
* **Google Cloud Run:** Serverless deployment target for the frontend application.

---

## Developer Setup (ADK Core)

### Requirements

- **uv**: Python package manager - [Install](https://docs.astral.sh/uv/getting-started/installation/)
- **agents-cli**: Agents CLI - Install with `uv tool install google-agents-cli`

### Quick Start

```bash
uvx google-agents-cli setup
agents-cli install
agents-cli playground
```

### Telemetry Setup (Optional but Recommended)

This project uses Google Cloud Trace and Cloud Monitoring for observability. The `install` scripts (`install.sh` / `install.ps1`) will automatically attempt to configure this for you by:
1. Enabling `cloudtrace.googleapis.com` and `monitoring.googleapis.com` for your active project.
2. Granting your active gcloud account the `roles/cloudtrace.agent` and `roles/monitoring.metricWriter` IAM roles.

If you encounter `403 Forbidden` errors in the backend console related to tracing or metrics, ensure you have run `gcloud auth login` and `gcloud config set project <PROJECT_ID>` before running the install script, or manually grant those roles to your account.uvx google-agents-cli setup
agents-cli install
agents-cli playground
```
