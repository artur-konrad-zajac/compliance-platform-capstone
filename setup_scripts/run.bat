@echo off
cd /d "%~dp0\.."
echo Starting the FastAPI backend...
start cmd /k "cd compliance-api && uv run uvicorn app.fast_api_app:app --host 0.0.0.0 --port 8000"

echo Starting the Vite frontend...
start cmd /k "cd compliance-platform && npm run dev"
