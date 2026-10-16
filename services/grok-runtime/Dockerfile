FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS register-node-deps

WORKDIR /register
COPY upstream/services/register/package.json upstream/services/register/package-lock.json ./
RUN npm ci --omit=dev

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

# Grok Castle and OpenAI Sentinel execute Node at runtime. Dependencies come
# from package-lock.json, never from a developer workstation's node_modules.
COPY --from=register-node-deps /usr/local/bin/node /usr/local/bin/node
COPY --chown=appuser:appuser upstream ./upstream
COPY --from=register-node-deps --chown=appuser:appuser /register/node_modules ./upstream/services/register/node_modules
COPY --chown=appuser:appuser runtime ./runtime

RUN node --version \
    && node -e "require('/app/upstream/services/register/node_modules/jsdom')" \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data

EXPOSE 8091
USER 10001:10001
CMD ["uvicorn", "runtime.main:app", "--host", "0.0.0.0", "--port", "8091", "--workers", "1"]
