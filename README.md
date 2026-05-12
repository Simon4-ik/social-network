# Social Network

Facebook-like social network with Go backend (SQLite + WebSockets) and Next.js frontend.

## Stack

- **Backend**: Go 1.22+ standard library `net/http` + `gorilla/websocket` + `golang-migrate` + `modernc.org/sqlite` (pure Go — no CGO).
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript.
- **DB**: SQLite with automatic migrations on startup.

## Features

- Auth: register / login / logout with bcrypt + cookie-backed sessions.
- Profiles: public / private toggle, follower & following lists.
- Followers: follow requests, auto-accept for public profiles, accept / decline.
- Posts: public / followers-only / specific-followers privacy; image upload (JPEG/PNG/GIF, 10 MB).
- Comments: optional image attachment.
- Groups: create / browse, invitations, join requests, group posts, group events with going / not-going RSVP.
- Chat: WebSocket-powered private DMs (mutual follow or public target) + group chat rooms, emoji shortcuts.
- Notifications: follow requests, group invites / requests / events; live push over WebSocket + badge in nav.

## Running locally (no Docker)

The backend uses `github.com/mattn/go-sqlite3` which requires a C toolchain (CGO).

- **Windows**: install [MSYS2](https://www.msys2.org/) or [TDM-GCC](https://jmeubank.github.io/tdm-gcc/), then ensure `gcc` is on PATH.
- **macOS**: `xcode-select --install`.
- **Linux**: install `build-essential` (Debian/Ubuntu) or `gcc` (Fedora/Arch).

```bash
# backend (needs gcc — see above)
cd backend
go run .            # starts on :8080

# frontend (separate terminal)
cd frontend
npm install
npm run dev         # http://localhost:3000
```

If you don't have gcc and don't want to install it, use Docker (next section) — the backend image's build stage installs `build-base` automatically.

## Running with Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:8080

## Folder structure

```
backend/
  server.go                  # HTTP entry point + route wiring
  pkg/
    auth/                    # session manager + middleware
    db/migrations/sqlite/    # numbered up/down SQL migrations
    db/sqlite/sqlite.go      # connection + migrate runner
    handlers/                # HTTP handlers per feature
    models/                  # data types
    notify/                  # DB insert + WS push helper
    ws/                      # websocket hub + client
  uploads/                   # uploaded media (gitignored)
frontend/
  app/                       # Next.js App Router pages
  components/                # shared components (Nav)
  lib/                       # api client, auth context, ws helper
```

## Notes

- The `migrate` package may emit a non-fatal `Dirty database version` if a previous run failed mid-migration — delete `backend/social.db` to start fresh.
- Avatar upload on register: the form lets you pick a file; the upload runs after registration. A `PUT /api/users/me` to set the avatar from the resulting path is a small follow-up worth wiring up if you want it to persist.
- Next.js 14 has an upstream security advisory tracked at https://nextjs.org/blog/security-update-2025-12-11 — upgrade to 15.x when convenient.
