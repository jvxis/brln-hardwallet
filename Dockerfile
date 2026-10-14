FROM node:24-alpine AS web
WORKDIR /src/webapp
COPY webapp/package*.json ./
RUN npm ci
COPY webapp/ ./
RUN npm run check && npm test && npm run build

FROM golang:1.26-alpine AS backend
WORKDIR /src/backend
COPY backend/ ./
RUN go test ./... && go vet ./...
ARG TARGETOS=linux
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/brln-hardwallet .

FROM scratch
COPY --from=backend /out/brln-hardwallet /brln-hardwallet
COPY --from=web /src/webapp/build /app/web
COPY LICENSE /licenses/Bowser-MIT
USER 65527:65527
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD ["/brln-hardwallet", "healthcheck"]
ENTRYPOINT ["/brln-hardwallet"]
