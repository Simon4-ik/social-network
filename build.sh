#!/usr/bin/env bash
# Build & run the social-network stack via Docker Compose.
# Usage:
#   ./build.sh              # build images and start containers in the background
#   ./build.sh stop         # stop containers
#   ./build.sh clean        # stop + remove volumes (wipes DB + uploads)
set -euo pipefail
cd "$(dirname "$0")"

case "${1:-up}" in
  up)
    docker compose up --build -d
    echo
    echo "Frontend: http://localhost:3000"
    echo "Backend:  http://localhost:8080"
    docker compose ps
    ;;
  stop)
    docker compose down
    ;;
  clean)
    docker compose down -v
    ;;
  *)
    echo "usage: $0 [up|stop|clean]" >&2
    exit 2
    ;;
esac
