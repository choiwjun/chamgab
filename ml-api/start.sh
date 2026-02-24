#!/bin/sh
set -eu

echo "=== Railway Startup ==="
echo "PORT=${PORT:-}"
echo "PYTHONUNBUFFERED=${PYTHONUNBUFFERED:-}"
echo "Python version:"
python --version

echo "Starting uvicorn on port ${PORT:-7860}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}"
