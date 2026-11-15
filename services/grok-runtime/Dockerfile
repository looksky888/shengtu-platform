FROM python:3.12-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/upstream:/app \
    DATA_DIR=/data

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin appuser

COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

COPY --chown=appuser:appuser upstream ./upstream
COPY --chown=appuser:appuser runtime ./runtime

RUN mkdir -p /data \
    && chown -R appuser:appuser /app /data

EXPOSE 8091
USER 10001:10001
CMD ["uvicorn", "runtime.main:app", "--host", "0.0.0.0", "--port", "8091", "--workers", "1"]
