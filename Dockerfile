FROM --platform=$BUILDPLATFORM node:24-alpine AS web
WORKDIR /src/webapp
COPY webapp/package*.json ./
RUN npm ci
COPY webapp/ ./
RUN test -s static/firmware/brln-tdisplay/manifest.json && test -s static/firmware/brln-tdisplay/firmware.bin
RUN npm run check && npm test && npm run build

FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS backend
WORKDIR /src/backend
COPY backend/ ./
RUN go test ./... && go vet ./...
ARG TARGETOS=linux
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/brln-hardwallet .

FROM scratch
COPY --from=backend /out/brln-hardwallet /brln-hardwallet
COPY --from=web /src/webapp/build /app/web
COPY --from=web /src/webapp/node_modules/esptool-js/LICENSE /licenses/esptool-js-Apache-2.0
COPY --from=web /src/webapp/node_modules/atob-lite/LICENSE.md /licenses/atob-lite-MIT
COPY --from=web /src/webapp/node_modules/pako/LICENSE /licenses/pako
COPY --from=backend /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY LICENSE /licenses/Bowser-MIT
USER 65527:65527
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD ["/brln-hardwallet", "healthcheck"]
ENTRYPOINT ["/brln-hardwallet"]
