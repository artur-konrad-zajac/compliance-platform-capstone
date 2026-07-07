#!/bin/bash
cd "$(dirname "$0")/.." || exit
echo "Starting the FastAPI backend on port 8000..."
cd compliance-api && uv run uvicorn app.fast_api_app:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "Starting the Vite frontend..."
cd ../compliance-platform && npm run dev &
FRONTEND_PID=$!

wait
