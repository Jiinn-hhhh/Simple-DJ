FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY space_requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY space_app.py app.py
COPY analysis.py .
COPY seperator.py .

# Create results directory
RUN mkdir -p /tmp/dj_results

EXPOSE 7860

# Use uvicorn with multiple workers for better performance
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
