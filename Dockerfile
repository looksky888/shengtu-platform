# syntax=docker/dockerfile:1.7

ARG VERSION=4.9.0-20261023-studio-craft
ARG COMMIT=unknown
ARG BUILD_DATE=unknown

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS web-deps

WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci


FROM web-deps AS web-build

COPY VERSION.txt /app/VERSION.txt
COPY web ./
ARG VERSION=4.9.0-20261023-studio-craft
ENV VITE_APP_VERSION=${VERSION}
RUN npm run build && npm run verify:dist


FROM golang:1.26.6-bookworm@sha256:116d58cbd88c1297624acc6e967a060012422bacf9930927e23fb719189c6f36 AS go-build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
COPY --from=web-build /app/internal/web/dist ./internal/web/dist
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=4.9.0-20261023-studio-craft
ARG COMMIT=unknown
ARG BUILD_DATE=unknown
# Keep cold builds inside the memory envelope of small production hosts.
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -p=1 -trimpath -tags=embed -ldflags="-s -w -X chatgpt2api/internal/version.Version=${VERSION} -X chatgpt2api/internal/version.Commit=${COMMIT} -X chatgpt2api/internal/version.Date=${BUILD_DATE} -X chatgpt2api/internal/version.BuildType=release -X chatgpt2api/internal/version.Deployment=docker" -o /out/chatgpt2api ./cmd/chatgpt2api


FROM debian:bookworm-slim@sha256:7b140f374b289a7c2befc338f42ebe6441b7ea838a042bbd5acbfca6ec875818 AS app

WORKDIR /app
ENV PORT=80
ENV CHATGPT2API_DEPLOYMENT=docker

# Runtime dependencies:
# - ca-certificates: required for HTTPS upstream requests
# - curl: container healthcheck
# - git: required by the git storage backend
# - tzdata: keep container timezone data available
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app

COPY --from=go-build --chown=appuser:appuser /out/chatgpt2api ./chatgpt2api

EXPOSE 80

USER 10001:10001
CMD ["/app/chatgpt2api"]
