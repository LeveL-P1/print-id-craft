FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=7000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY docker/rembg/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY docker/rembg/server.py .

EXPOSE 7000

CMD ["python", "server.py"]
