FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Use Python to read PORT env var (avoids shell expansion issues).
# Railway injects $PORT at runtime; local/HF can fall back to 7860.
CMD python -c "import os; port=os.environ.get('PORT','7860'); os.execvp('uvicorn',['uvicorn','app.main:app','--host','0.0.0.0','--port',port])"
