FROM python:3.11-slim

# Cache bust: 2026-03-21c
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY render-service/requirements.txt .
RUN pip install -r requirements.txt

COPY render-service/main.py .
COPY render-service/generate_luts.py .

# Generate all LUT files at build time — no runtime overhead
RUN python generate_luts.py

CMD ["python", "main.py"]
