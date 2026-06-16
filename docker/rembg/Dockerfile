# PyTorch base — avoids OOM installing torch on HF free builders
FROM pytorch/pytorch:2.3.1-cpu

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

RUN pip install --upgrade pip setuptools wheel \
    && pip install --prefer-binary -r requirements-base.txt

RUN pip install --prefer-binary -r requirements-inspyrenet.txt

COPY server.py .

EXPOSE 7860

CMD ["python", "server.py"]
