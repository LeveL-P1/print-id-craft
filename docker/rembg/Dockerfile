FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=7860
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DEFAULT_TIMEOUT=1000
ENV OMP_NUM_THREADS=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-base.txt requirements-inspyrenet.txt ./

# Split pip steps — HF free builders OOM if torch + rembg + InSPyReNet install together
RUN pip install --upgrade pip setuptools wheel \
    && pip install --prefer-binary -r requirements-base.txt

RUN pip install --prefer-binary torch torchvision \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install --prefer-binary -r requirements-inspyrenet.txt

COPY server.py .

EXPOSE 7860

CMD ["python", "server.py"]
