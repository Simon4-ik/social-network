package handlers

import (
	"database/sql"
	"net/http"

	"social-network/pkg/auth"
)

type Chat struct {
	DB *sql.DB
}

type msgOut struct {
	ID         string  `json:"id"`
	From       string  `json:"from"`
	To         *string `json:"to,omitempty"`
	GroupID    *string `json:"group_id,omitempty"`
	Content    string  `json:"content"`
	CreatedAt  string  `json:"created_at"`
}

// GET /api/messages/dm/{user_id}
func (c *Chat) DMHistory(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	other := r.PathValue("user_id")
	rows, err := c.DB.Query(`
		SELECT id, sender_id, recipient_id, group_id, content, created_at FROM messages
		WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
		ORDER BY created_at ASC LIMIT 500`, me, other, other, me)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanMessages(rows))
}

// GET /api/messages/group/{group_id}
func (c *Chat) GroupHistory(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	gid := r.PathValue("group_id")
	var n int
	_ = c.DB.QueryRow(`SELECT COUNT(*) FROM group_members WHERE group_id = ? AND user_id = ?`, gid, me).Scan(&n)
	if n == 0 {
		http.Error(w, "not a member", http.StatusForbidden)
		return
	}
	rows, err := c.DB.Query(`
		SELECT id, sender_id, recipient_id, group_id, content, created_at FROM messages
		WHERE group_id = ? ORDER BY created_at ASC LIMIT 500`, gid)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanMessages(rows))
}

// GET /api/conversations
// Returns all users this user can DM with (followers/following/public) plus groups they belong to.
func (c *Chat) Conversations(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	uRows, err := c.DB.Query(`
		SELECT DISTINCT u.id, u.first_name, u.last_name, u.nickname, u.avatar_path
		FROM users u
		WHERE u.id <> ? AND (
			u.is_public = 1 OR
			EXISTS (SELECT 1 FROM followers f WHERE f.status='accepted' AND
			        ((f.follower_id = ? AND f.following_id = u.id) OR (f.follower_id = u.id AND f.following_id = ?)))
		)`, me, me, me)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer uRows.Close()
	users := scanMiniUsers(uRows)

	gRows, err := c.DB.Query(`
		SELECT g.id, g.title FROM groups g
		JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ?`, me)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer gRows.Close()
	type g struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	groups := []g{}
	for gRows.Next() {
		var x g
		if err := gRows.Scan(&x.ID, &x.Title); err == nil {
			groups = append(groups, x)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users, "groups": groups})
}

func scanMessages(rows *sql.Rows) []msgOut {
	out := []msgOut{}
	for rows.Next() {
		var m msgOut
		var recipient, group sql.NullString
		if err := rows.Scan(&m.ID, &m.From, &recipient, &group, &m.Content, &m.CreatedAt); err == nil {
			if recipient.Valid {
				m.To = &recipient.String
			}
			if group.Valid {
				m.GroupID = &group.String
			}
			out = append(out, m)
		}
	}
	return out
}
