package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"social-network/pkg/auth"
)

type Notifications struct {
	DB *sql.DB
}

type notifOut struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	IsRead    bool            `json:"is_read"`
	CreatedAt string          `json:"created_at"`
}

// GET /api/notifications
func (n *Notifications) List(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	rows, err := n.DB.Query(`
		SELECT id, type, payload, is_read, created_at FROM notifications
		WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`, me)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := []notifOut{}
	for rows.Next() {
		var o notifOut
		var payload string
		var read int
		if err := rows.Scan(&o.ID, &o.Type, &payload, &read, &o.CreatedAt); err == nil {
			o.Payload = json.RawMessage(payload)
			o.IsRead = read == 1
			out = append(out, o)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /api/notifications/{id}/read
func (n *Notifications) MarkRead(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	id := r.PathValue("id")
	_, err := n.DB.Exec(`UPDATE notifications SET is_read=1 WHERE id = ? AND user_id = ?`, id, me)
	if err != nil {
		http.Error(w, "update failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/notifications/read-all
func (n *Notifications) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	_, err := n.DB.Exec(`UPDATE notifications SET is_read=1 WHERE user_id = ? AND is_read = 0`, me)
	if err != nil {
		http.Error(w, "update failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
