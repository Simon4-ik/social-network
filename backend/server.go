package main

import (
	"log"
	"net/http"
	"os"

	"social-network/pkg/auth"
	"social-network/pkg/db/sqlite"
	"social-network/pkg/handlers"
	"social-network/pkg/notify"
	wsv "social-network/pkg/ws"
)

func main() {
	dbPath := envOr("DB_PATH", "social.db")
	migrationsURL := envOr("MIGRATIONS_URL", "file://pkg/db/migrations/sqlite")
	addr := envOr("ADDR", ":8080")

	db, err := sqlite.Open(dbPath)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer db.Close()

	if err := sqlite.Migrate(db, migrationsURL); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	uploadsDir := envOr("UPLOADS_DIR", "uploads")
	sessions := auth.NewManager(db)
	authH := &handlers.Auth{DB: db, Sessions: sessions}
	wsSrv := wsv.New(db)
	notifier := notify.New(db, wsSrv.Hub)
	uploadH := &handlers.Upload{Dir: uploadsDir}
	followH := &handlers.Followers{DB: db, Notifier: notifier}
	profileH := &handlers.Profile{DB: db}
	postsH := &handlers.Posts{DB: db, Notifier: notifier}
	groupsH := &handlers.Groups{DB: db, Notifier: notifier}
	chatH := &handlers.Chat{DB: db}
	notifH := &handlers.Notifications{DB: db}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("POST /api/auth/register", authH.Register)
	mux.HandleFunc("POST /api/auth/login", authH.Login)
	mux.HandleFunc("POST /api/auth/logout", authH.Logout)
	mux.HandleFunc("GET /api/auth/me", sessions.Require(authH.Me))
	mux.HandleFunc("POST /api/upload", sessions.Require(uploadH.Handle))
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadsDir))))

	mux.HandleFunc("POST /api/users/{id}/follow", sessions.Require(followH.Follow))
	mux.HandleFunc("DELETE /api/users/{id}/follow", sessions.Require(followH.Unfollow))
	mux.HandleFunc("GET /api/users/{id}/followers", sessions.Require(followH.ListFollowers))
	mux.HandleFunc("GET /api/users/{id}/following", sessions.Require(followH.ListFollowing))
	mux.HandleFunc("GET /api/follow-requests", sessions.Require(followH.PendingRequests))
	mux.HandleFunc("POST /api/follow-requests/{follower_id}/accept", sessions.Require(followH.Accept))
	mux.HandleFunc("POST /api/follow-requests/{follower_id}/decline", sessions.Require(followH.Decline))

	mux.HandleFunc("GET /api/users", sessions.Require(profileH.List))
	mux.HandleFunc("GET /api/users/{id}", sessions.Require(profileH.Get))
	mux.HandleFunc("PUT /api/users/me/privacy", sessions.Require(profileH.UpdatePrivacy))
	mux.HandleFunc("PUT /api/users/me", sessions.Require(profileH.UpdateMe))

	mux.HandleFunc("POST /api/posts", sessions.Require(postsH.Create))
	mux.HandleFunc("GET /api/feed", sessions.Require(postsH.Feed))
	mux.HandleFunc("GET /api/users/{id}/posts", sessions.Require(postsH.ByUser))
	mux.HandleFunc("POST /api/posts/{id}/comments", sessions.Require(postsH.AddComment))
	mux.HandleFunc("GET /api/posts/{id}/comments", sessions.Require(postsH.ListComments))

	mux.HandleFunc("POST /api/groups", sessions.Require(groupsH.Create))
	mux.HandleFunc("GET /api/groups", sessions.Require(groupsH.List))
	mux.HandleFunc("GET /api/groups/{id}", sessions.Require(groupsH.Get))
	mux.HandleFunc("POST /api/groups/{id}/invite", sessions.Require(groupsH.Invite))
	mux.HandleFunc("POST /api/group-invitations/{id}/accept", sessions.Require(groupsH.AcceptInvite))
	mux.HandleFunc("POST /api/group-invitations/{id}/decline", sessions.Require(groupsH.DeclineInvite))
	mux.HandleFunc("POST /api/groups/{id}/request", sessions.Require(groupsH.RequestJoin))
	mux.HandleFunc("GET /api/groups/{id}/join-requests", sessions.Require(groupsH.ListJoinRequests))
	mux.HandleFunc("POST /api/group-requests/{id}/accept", sessions.Require(groupsH.HandleJoinRequest(true)))
	mux.HandleFunc("POST /api/group-requests/{id}/decline", sessions.Require(groupsH.HandleJoinRequest(false)))
	mux.HandleFunc("GET /api/groups/{id}/posts", sessions.Require(groupsH.Posts))
	mux.HandleFunc("GET /api/groups/{id}/members", sessions.Require(groupsH.Members))
	mux.HandleFunc("POST /api/groups/{id}/events", sessions.Require(groupsH.CreateEvent))
	mux.HandleFunc("GET /api/groups/{id}/events", sessions.Require(groupsH.ListEvents))
	mux.HandleFunc("POST /api/events/{id}/respond", sessions.Require(groupsH.RespondEvent))

	mux.HandleFunc("GET /api/conversations", sessions.Require(chatH.Conversations))
	mux.HandleFunc("GET /api/messages/dm/{user_id}", sessions.Require(chatH.DMHistory))
	mux.HandleFunc("GET /api/messages/group/{group_id}", sessions.Require(chatH.GroupHistory))
	mux.HandleFunc("POST /api/messages/dm/{user_id}/read", sessions.Require(chatH.MarkDMRead))
	mux.HandleFunc("POST /api/messages/group/{group_id}/read", sessions.Require(chatH.MarkGroupRead))
	mux.HandleFunc("GET /api/ws", sessions.Require(wsSrv.Handle))

	mux.HandleFunc("GET /api/notifications", sessions.Require(notifH.List))
	mux.HandleFunc("POST /api/notifications/{id}/read", sessions.Require(notifH.MarkRead))
	mux.HandleFunc("POST /api/notifications/read-all", sessions.Require(notifH.MarkAllRead))

	handler := withCORS(mux)

	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func withCORS(next http.Handler) http.Handler {
	allowed := envOr("CORS_ORIGIN", "http://localhost:3000")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowed)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
