# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Go 1.22+, in `backend/`)

```bash
cd backend
go run .                # starts on :8080, auto-runs migrations against social.db
go build -o server .    # produces server binary
go vet ./...            # static analysis
go test ./...           # run tests (none currently exist)
```

`mattn/go-sqlite3` is the driver, so **CGO is required** — gcc must be on PATH (MSYS2 / TDM-GCC on Windows, `xcode-select --install` on macOS, `build-essential` on Linux). Note: the README's top-of-file stack list mentions `modernc.org/sqlite (pure Go)`, but `go.mod` actually pins `mattn/go-sqlite3` and the README's "Running locally" section reflects that — trust `go.mod`.

Env overrides (all optional): `ADDR`, `DB_PATH`, `MIGRATIONS_URL`, `UPLOADS_DIR`, `CORS_ORIGIN`.

### Frontend (Next.js 14, in `frontend/`)

```bash
cd frontend
npm install
npm run dev             # http://localhost:3000
npm run build && npm start
```

`NEXT_PUBLIC_API_URL` (default `http://localhost:8080`) is baked in at build time — rebuild after changing it.

### Docker / full stack

```bash
docker compose up --build      # both services
./build.sh up | stop | clean   # wrapper; `clean` wipes the volume (DB + uploads)
```

### Recovering from a failed migration

If startup logs `Dirty database version`, delete `backend/social.db` (plus `social.db-shm` / `social.db-wal`) to reset. Migrations are versioned numerically in `backend/pkg/db/migrations/sqlite/` and run automatically on startup.

## Architecture

### Backend wiring

`backend/server.go` is the single composition root. It opens SQLite, runs migrations, then constructs each handler struct by injecting `*sql.DB`, the `auth.Manager`, the `notify.Notifier`, and the WebSocket hub. All API routes are registered against a single `http.ServeMux` using Go 1.22's pattern syntax (`POST /api/...`, path params via `{id}`). `withCORS` is the only middleware wrapper; per-route auth is enforced by `sessions.Require(...)`.

Handlers are grouped by feature in `pkg/handlers/` (auth, profile, followers, posts, groups, chat, notifications, upload). They share `util.go` for JSON / error helpers and pull the authenticated user via `auth.UserID(r)`, which reads a context value populated by the session middleware.

### Auth & sessions

`pkg/auth/session.go` is the canonical session store: opaque UUID stored in the `sessions` table, returned via `session_id` cookie, 7-day TTL. `Manager.Require` is HTTP middleware that resolves the cookie to a user-ID, stuffs it in request context, or returns 401. Passwords are bcrypt'd. There is no JWT / stateless token path — every authed request hits the `sessions` table.

### Realtime (WebSockets + notifications)

`pkg/ws/hub.go` keeps an in-memory `map[userID] → set[*Client]` (a user may have multiple tabs). `Hub.SendTo` / `Broadcast` push JSON `Envelope{type, payload}` frames; slow consumers are dropped non-blocking.

`pkg/notify/` wraps "insert a notifications row AND push via the hub" — handlers should call the `Notifier` rather than touching the hub directly so the on-disk and live channels stay in sync. The frontend opens one socket at `/api/ws` (`frontend/lib/ws.ts`) and dispatches by `type`.

### Posts privacy model

`posts.privacy` is `public | almost_private | private | group`:

- `public` — anyone signed in.
- `almost_private` — author's followers only.
- `private` — restricted to user IDs explicitly listed in `post_visibilities` (the "specific followers" feature).
- `group` — visible only inside a group; `posts.group_id` is set.

When adding feed queries, all four cases must be honored or you'll either leak posts or hide legitimate ones.

### Uploads

`POST /api/upload` (multipart) stores files under `UPLOADS_DIR` and returns a relative path. The same path is then stored in `posts.image_path` / `comments.image_path` / user avatar. The server statically serves `GET /uploads/...` from the same directory. The frontend's `mediaURL()` helper prefixes the API origin onto stored paths.

### Frontend layout

Next.js App Router under `frontend/app/`. `lib/api.ts` exposes a single `api()` fetcher that sets `credentials: "include"` so the session cookie travels on every request (the backend's CORS allows credentials from `CORS_ORIGIN`). `lib/auth.tsx` provides the React context that hydrates from `GET /api/auth/me`. `lib/ws.ts` builds the WS URL by swapping `http`→`ws` on `NEXT_PUBLIC_API_URL`.

## Conventions worth knowing

- IDs are UUID strings (`github.com/google/uuid`), not integers. New tables should follow suit so foreign keys line up.
- Migrations are append-only: add the next numbered `up`/`down` pair rather than editing existing files — `golang-migrate` tracks state via the version number.
- Notifications are not a side effect — they're a feature. When you add an event that another user should see (follow, group invite, RSVP, etc.), route it through `notify.Notifier`, not raw SQL + raw hub calls.
- Image upload accepts JPEG/PNG/GIF up to 10 MB (`pkg/handlers/upload.go`). Keep these limits consistent if extending.
