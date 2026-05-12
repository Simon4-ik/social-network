FROM golang:1.23-alpine AS build
RUN apk add --no-cache build-base
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -o /out/server .

FROM alpine:3.20
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /out/server /app/server
COPY --from=build /src/pkg/db/migrations /app/pkg/db/migrations
RUN mkdir -p /app/uploads && chown -R app:app /app
USER app
ENV DB_PATH=/app/data/social.db \
    MIGRATIONS_URL=file:///app/pkg/db/migrations/sqlite \
    UPLOADS_DIR=/app/uploads \
    ADDR=:8080
EXPOSE 8080
CMD ["/app/server"]
