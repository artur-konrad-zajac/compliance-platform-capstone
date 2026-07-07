Set-Location -Path "$PSScriptRoot\.."
Write-Host "Starting the FastAPI backend on port 8000..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd compliance-api; uv run uvicorn app.fast_api_app:app --host 0.0.0.0 --port 8000"

Write-Host "Starting the Vite frontend..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd compliance-platform; npm run dev"
