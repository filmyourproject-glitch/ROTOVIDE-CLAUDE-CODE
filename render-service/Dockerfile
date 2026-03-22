FROM python:3.11-slim
# Cache bust: 2026-03-21b
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY render-service/requirements.txt .
RUN pip install -r requirements.txt
COPY render-service/main.py .
CMD ["python", "main.py"]
