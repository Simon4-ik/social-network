package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"social-network/pkg/auth"
	"social-network/pkg/notify"
)

type Groups struct {
	DB       *sql.DB
	Notifier *notify.Notifier
}

type createGroupReq struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

// POST /api/groups
func (g *Groups) Create(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	var req createGroupReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		http.Error(w, "title required", http.StatusBadRequest)
		return
	}
	id := newUUID()
	tx, _ := g.DB.Begin()
	defer tx.Rollback()
	_, err := tx.Exec(`INSERT INTO groups (id, creator_id, title, description) VALUES (?, ?, ?, ?)`, id, me, req.Title, req.Description)
	if err != nil {
		http.Error(w, "insert failed", http.StatusInternalServerError)
		return
	}
	_, _ = tx.Exec(`INSERT INTO group_members (group_id, user_id) VALUES (?, ?)`, id, me)
	if err := tx.Commit(); err != nil {
		http.Error(w, "commit failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// GET /api/groups  (browse all)
func (g *Groups) List(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	rows, err := g.DB.Query(`
		SELECT g.id, g.title, g.description, g.creator_id, g.created_at,
		       (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members,
		       EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ?) AS is_member
		FROM groups g ORDER BY g.created_at DESC`, me)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type out struct {
		ID          string `json:"id"`
		Title       string `json:"title"`
		Description string `json:"description"`
		CreatorID   string `json:"creator_id"`
		CreatedAt   string `json:"created_at"`
		Members     int    `json:"members"`
		IsMember    bool   `json:"is_member"`
	}
	results := []out{}
	for rows.Next() {
		var o out
		if err := rows.Scan(&o.ID, &o.Title, &o.Description, &o.CreatorID, &o.CreatedAt, &o.Members, &o.IsMember); err == nil {
			results = append(results, o)
		}
	}
	writeJSON(w, http.StatusOK, results)
}

// GET /api/groups/{id}
func (g *Groups) Get(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	id := r.PathValue("id")
	var title, desc, creator, createdAt string
	err := g.DB.QueryRow(`SELECT title, description, creator_id, created_at FROM groups WHERE id = ?`, id).
		Scan(&title, &desc, &creator, &createdAt)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	var isMember int
	_ = g.DB.QueryRow(`SELECT COUNT(*) FROM group_members WHERE group_id = ? AND user_id = ?`, id, me).Scan(&isMember)
	writeJSON(w, http.StatusOK, map[string]any{
		"id": id, "title": title, "description": desc, "creator_id": creator, "created_at": createdAt,
		"is_member": isMember > 0, "is_creator": creator == me,
	})
}

type inviteReq struct {
	UserIDs []string `json:"user_ids"`
}

// POST /api/groups/{id}/invite
func (g *Groups) Invite(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	gid := r.PathValue("id")
	if !g.isMember(gid, me) {
		http.Error(w, "not a member", http.StatusForbidden)
		return
	}
	var req inviteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	for _, uid := range req.UserIDs {
		if uid == me || g.isMember(gid, uid) {
			continue
		}
		invID := newUUID()
		res, err := g.DB.Exec(`INSERT OR IGNORE INTO group_invitations (id, group_id, inviter_id, invitee_id) VALUES (?, ?, ?, ?)`, invID, gid, me, uid)
		if err != nil {
			continue
		}
		if n, _ := res.RowsAffected(); n > 0 {
			g.Notifier.Send(uid, "group_invite", map[string]any{
				"group_id":      gid,
				"group_title":   g.Notifier.GroupTitle(gid),
				"invitation_id": invID,
				"from":          me,
				"from_name":     g.Notifier.UserName(me),
			})
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/group-invitations/{id}/accept
func (g *Groups) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	invID := r.PathValue("id")
	var gid string
	err := g.DB.QueryRow(`SELECT group_id FROM group_invitations WHERE id = ? AND invitee_id = ? AND status='pending'`, invID, me).Scan(&gid)
	if err != nil {
		http.Error(w, "invitation not found", http.StatusNotFound)
		return
	}
	tx, _ := g.DB.Begin()
	defer tx.Rollback()
	_, _ = tx.Exec(`UPDATE group_invitations SET status='accepted' WHERE id = ?`, invID)
	_, _ = tx.Exec(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`, gid, me)
	tx.Commit()
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/group-invitations/{id}/decline
func (g *Groups) DeclineInvite(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	invID := r.PathValue("id")
	_, err := g.DB.Exec(`UPDATE group_invitations SET status='declined' WHERE id = ? AND invitee_id = ? AND status='pending'`, invID, me)
	if err != nil {
		http.Error(w, "decline failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/groups/{id}/request
func (g *Groups) RequestJoin(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	gid := r.PathValue("id")
	if g.isMember(gid, me) {
		http.Error(w, "already a member", http.StatusConflict)
		return
	}
	var creator string
	if err := g.DB.QueryRow(`SELECT creator_id FROM groups WHERE id = ?`, gid).Scan(&creator); err != nil {
		http.Error(w, "group not found", http.StatusNotFound)
		return
	}
	reqID := newUUID()
	res, err := g.DB.Exec(`INSERT OR IGNORE INTO group_join_requests (id, group_id, user_id) VALUES (?, ?, ?)`, reqID, gid, me)
	if err != nil {
		http.Error(w, "request failed", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		g.Notifier.Send(creator, "group_join_request", map[string]any{
			"group_id":    gid,
			"group_title": g.Notifier.GroupTitle(gid),
			"request_id":  reqID,
			"from":        me,
			"from_name":   g.Notifier.UserName(me),
		})
	}
	w.WriteHeader(http.StatusCreated)
}

// POST /api/group-requests/{id}/accept|decline (creator)
func (g *Groups) HandleJoinRequest(accept bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		me := auth.UserID(r)
		reqID := r.PathValue("id")
		var gid, uid string
		err := g.DB.QueryRow(`
			SELECT r.group_id, r.user_id FROM group_join_requests r
			JOIN groups g ON g.id = r.group_id
			WHERE r.id = ? AND g.creator_id = ? AND r.status='pending'`, reqID, me).Scan(&gid, &uid)
		if err != nil {
			http.Error(w, "not allowed", http.StatusForbidden)
			return
		}
		tx, _ := g.DB.Begin()
		defer tx.Rollback()
		if accept {
			_, _ = tx.Exec(`UPDATE group_join_requests SET status='accepted' WHERE id = ?`, reqID)
			_, _ = tx.Exec(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`, gid, uid)
		} else {
			_, _ = tx.Exec(`UPDATE group_join_requests SET status='declined' WHERE id = ?`, reqID)
		}
		tx.Commit()
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /api/groups/{id}/posts
func (g *Groups) Posts(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	gid := r.PathValue("id")
	if !g.isMember(gid, me) {
		http.Error(w, "not a member", http.StatusForbidden)
		return
	}
	rows, err := g.DB.Query(`
		SELECT p.id, p.user_id, u.first_name || ' ' || u.last_name AS author, u.avatar_path,
		       p.content, p.image_path, p.privacy, p.group_id, p.created_at,
		       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS cc
		FROM posts p JOIN users u ON u.id = p.user_id
		WHERE p.group_id = ? ORDER BY p.created_at DESC`, gid)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanPosts(rows))
}

// GET /api/groups/{id}/members
func (g *Groups) Members(w http.ResponseWriter, r *http.Request) {
	gid := r.PathValue("id")
	rows, err := g.DB.Query(`
		SELECT u.id, u.first_name, u.last_name, u.nickname, u.avatar_path
		FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ?`, gid)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanMiniUsers(rows))
}

type createEventReq struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	EventTime   string `json:"event_time"` // RFC3339
}

// POST /api/groups/{id}/events
func (g *Groups) CreateEvent(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	gid := r.PathValue("id")
	if !g.isMember(gid, me) {
		http.Error(w, "not a member", http.StatusForbidden)
		return
	}
	var req createEventReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	t, err := time.Parse(time.RFC3339, req.EventTime)
	if err != nil {
		http.Error(w, "bad event_time (RFC3339)", http.StatusBadRequest)
		return
	}
	id := newUUID()
	_, err = g.DB.Exec(`INSERT INTO events (id, group_id, creator_id, title, description, event_time) VALUES (?, ?, ?, ?, ?, ?)`,
		id, gid, me, req.Title, req.Description, t)
	if err != nil {
		http.Error(w, "insert failed", http.StatusInternalServerError)
		return
	}
	rows, err := g.DB.Query(`SELECT user_id FROM group_members WHERE group_id = ? AND user_id <> ?`, gid, me)
	if err == nil {
		for rows.Next() {
			var uid string
			if err := rows.Scan(&uid); err == nil {
				g.Notifier.Send(uid, "group_event", map[string]any{
					"group_id":    gid,
					"group_title": g.Notifier.GroupTitle(gid),
					"event_id":    id,
					"event_title": req.Title,
				})
			}
		}
		rows.Close()
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// GET /api/groups/{id}/events
func (g *Groups) ListEvents(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	gid := r.PathValue("id")
	if !g.isMember(gid, me) {
		http.Error(w, "not a member", http.StatusForbidden)
		return
	}
	rows, err := g.DB.Query(`
		SELECT e.id, e.title, e.description, e.event_time, e.creator_id, e.created_at,
		       (SELECT COUNT(*) FROM event_responses r WHERE r.event_id = e.id AND r.response='going') AS going,
		       (SELECT COUNT(*) FROM event_responses r WHERE r.event_id = e.id AND r.response='not_going') AS not_going,
		       (SELECT response FROM event_responses r WHERE r.event_id = e.id AND r.user_id = ?) AS mine
		FROM events e WHERE e.group_id = ? ORDER BY e.event_time ASC`, me, gid)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type out struct {
		ID          string  `json:"id"`
		Title       string  `json:"title"`
		Description string  `json:"description"`
		EventTime   string  `json:"event_time"`
		CreatorID   string  `json:"creator_id"`
		CreatedAt   string  `json:"created_at"`
		Going       int     `json:"going"`
		NotGoing    int     `json:"not_going"`
		Mine        *string `json:"my_response,omitempty"`
	}
	results := []out{}
	for rows.Next() {
		var o out
		if err := rows.Scan(&o.ID, &o.Title, &o.Description, &o.EventTime, &o.CreatorID, &o.CreatedAt, &o.Going, &o.NotGoing, &o.Mine); err == nil {
			results = append(results, o)
		}
	}
	writeJSON(w, http.StatusOK, results)
}

type eventRespReq struct {
	Response string `json:"response"` // going | not_going
}

// POST /api/events/{id}/respond
func (g *Groups) RespondEvent(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	eid := r.PathValue("id")
	var req eventRespReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	if req.Response != "going" && req.Response != "not_going" {
		http.Error(w, "bad response", http.StatusBadRequest)
		return
	}
	var gid string
	if err := g.DB.QueryRow(`SELECT group_id FROM events WHERE id = ?`, eid).Scan(&gid); err != nil {
		http.Error(w, "event not found", http.StatusNotFound)
		return
	}
	if !g.isMember(gid, me) {
		http.Error(w, "not a member", http.StatusForbidden)
		return
	}
	_, err := g.DB.Exec(`
		INSERT INTO event_responses (event_id, user_id, response) VALUES (?, ?, ?)
		ON CONFLICT(event_id, user_id) DO UPDATE SET response = excluded.response`, eid, me, req.Response)
	if err != nil {
		http.Error(w, "save failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/groups/{id}/join-requests  (creator only)
func (g *Groups) ListJoinRequests(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	gid := r.PathValue("id")
	var creator string
	if err := g.DB.QueryRow(`SELECT creator_id FROM groups WHERE id = ?`, gid).Scan(&creator); err != nil || creator != me {
		http.Error(w, "not allowed", http.StatusForbidden)
		return
	}
	rows, err := g.DB.Query(`
		SELECT r.id, u.id, u.first_name, u.last_name, u.nickname, u.avatar_path
		FROM group_join_requests r JOIN users u ON u.id = r.user_id
		WHERE r.group_id = ? AND r.status='pending'`, gid)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type out struct {
		RequestID  string  `json:"request_id"`
		ID         string  `json:"id"`
		FirstName  string  `json:"first_name"`
		LastName   string  `json:"last_name"`
		Nickname   *string `json:"nickname,omitempty"`
		AvatarPath *string `json:"avatar_path,omitempty"`
	}
	results := []out{}
	for rows.Next() {
		var o out
		if err := rows.Scan(&o.RequestID, &o.ID, &o.FirstName, &o.LastName, &o.Nickname, &o.AvatarPath); err == nil {
			results = append(results, o)
		}
	}
	writeJSON(w, http.StatusOK, results)
}

func (g *Groups) isMember(groupID, userID string) bool {
	var n int
	_ = g.DB.QueryRow(`SELECT COUNT(*) FROM group_members WHERE group_id = ? AND user_id = ?`, groupID, userID).Scan(&n)
	return n > 0
}
