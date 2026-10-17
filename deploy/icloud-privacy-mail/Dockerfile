FROM golang:1.26.9-alpine@sha256:3082400e369fa24d5fc60bca20edab3f6d604e0c5a690ec66b295eff4dd87ade AS build

RUN apk add --no-cache ca-certificates
WORKDIR /src
COPY deploy/icloud-privacy-mail/source/ .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/icloud-privacy-mail ./cmd/panel

FROM alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S -g 10001 appuser \
    && adduser -S -D -H -u 10001 -G appuser appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /data
COPY --from=build /out/icloud-privacy-mail /usr/local/bin/icloud-privacy-mail

VOLUME ["/data"]

USER 10001:10001
ENTRYPOINT ["/usr/local/bin/icloud-privacy-mail"]
CMD ["--host", "0.0.0.0", "--port", "8787", "--config", "", "--data", "/data/state.db"]
