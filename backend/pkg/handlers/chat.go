package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"social-network/pkg/auth"
)

const (
	defaultMessageLimit = 30
	maxMessageLimit     = 200
)

func parseLimit(r *http.Request) int {
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > maxMessageLimit {
				return maxMessageLimit
			}
			return n
		}
	}
	return defaultMessageLimit
}

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

// GET /api/messages/dm/{user_id}?before=<iso>&limit=<n>
func (c *Chat) DMHistory(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	other := r.PathValue("user_id")
	limit := parseLimit(r)
	before := r.URL.Query().Get("before")

	var rows *sql.Rows
	var err error
	if before != "" {
		rows, err = c.DB.Query(`
			SELECT id, sender_id, recipient_id, group_id, content, created_at FROM messages
			WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
			  AND created_at < ?
			ORDER BY created_at DESC LIMIT ?`, me, other, other, me, before, limit)
	} else {
		rows, err = c.DB.Query(`
			SELECT id, sender_id, recipient_id, group_id, content, created_at FROM messages
			WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
			ORDER BY created_at DESC LIMIT ?`, me, other, other, me, limit)
	}
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := scanMessages(rows)
	reverseMessages(out)
	writeJSON(w, http.StatusOK, out)
}

// GET /api/messages/group/{group_id}?before=<iso>&limit=<n>
func (c *Chat) GroupHistory(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	gid := r.PathValue("group_id")
	var n int
	_ = c.DB.QueryRow(`SELECT COUNT(*) FROM group_members WHERE group_id = ? AND user_id = ?`, gid, me).Scan(&n)
	if n == 0 {
		http.Error(w, "not a member", http.StatusForbidden)
		return
	}
	limit := parseLimit(r)
	before := r.URL.Query().Get("before")

	var rows *sql.Rows
	var err error
	if before != "" {
		rows, err = c.DB.Query(`
			SELECT id, sender_id, recipient_id, group_id, content, created_at FROM messages
			WHERE group_id = ? AND created_at < ?
			ORDER BY created_at DESC LIMIT ?`, gid, before, limit)
	} else {
		rows, err = c.DB.Query(`
			SELECT id, sender_id, recipient_id, group_id, content, created_at FROM messages
			WHERE group_id = ?
			ORDER BY created_at DESC LIMIT ?`, gid, limit)
	}
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := scanMessages(rows)
	reverseMessages(out)
	writeJSON(w, http.StatusOK, out)
}

func reverseMessages(s []msgOut) {
	for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
		s[i], s[j] = s[j], s[i]
	}
}

// GET /api/conversations
// Returns all users this user can DM with (followers/following/public) plus groups they belong to,
// each enriched with an `unread` count from message-type notifications.
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
		ID     string `json:"id"`
		Title  string `json:"title"`
		Unread int    `json:"unread"`
	}
	groups := []g{}
	for gRows.Next() {
		var x g
		if err := gRows.Scan(&x.ID, &x.Title); err == nil {
			groups = append(groups, x)
		}
	}

	dmUnread := map[string]int{}
	if rows, err := c.DB.Query(`
		SELECT json_extract(payload, '$.from') AS from_id, COUNT(*)
		FROM notifications
		WHERE user_id = ? AND type = 'dm_message' AND is_read = 0
		GROUP BY from_id`, me); err == nil {
		for rows.Next() {
			var from sql.NullString
			var n int
			if rows.Scan(&from, &n) == nil && from.Valid {
				dmUnread[from.String] = n
			}
		}
		rows.Close()
	}
	groupUnread := map[string]int{}
	if rows, err := c.DB.Query(`
		SELECT json_extract(payload, '$.group_id') AS gid, COUNT(*)
		FROM notifications
		WHERE user_id = ? AND type = 'group_message' AND is_read = 0
		GROUP BY gid`, me); err == nil {
		for rows.Next() {
			var gid sql.NullString
			var n int
			if rows.Scan(&gid, &n) == nil && gid.Valid {
				groupUnread[gid.String] = n
			}
		}
		rows.Close()
	}

	type userOut struct {
		MiniUser
		Unread int `json:"unread"`
	}
	usersOut := make([]userOut, 0, len(users))
	for _, u := range users {
		usersOut = append(usersOut, userOut{MiniUser: u, Unread: dmUnread[u.ID]})
	}
	for i := range groups {
		groups[i].Unread = groupUnread[groups[i].ID]
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": usersOut, "groups": groups})
}

// POST /api/messages/dm/{user_id}/read
// Marks every dm_message notification from the given peer as read.
func (c *Chat) MarkDMRead(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	other := r.PathValue("user_id")
	_, err := c.DB.Exec(`
		UPDATE notifications SET is_read = 1
		WHERE user_id = ? AND type = 'dm_message' AND is_read = 0
		  AND json_extract(payload, '$.from') = ?`, me, other)
	if err != nil {
		http.Error(w, "update failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/messages/group/{group_id}/read
// Marks every group_message notification for the given group as read.
func (c *Chat) MarkGroupRead(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	gid := r.PathValue("group_id")
	_, err := c.DB.Exec(`
		UPDATE notifications SET is_read = 1
		WHERE user_id = ? AND type = 'group_message' AND is_read = 0
		  AND json_extract(payload, '$.group_id') = ?`, me, gid)
	if err != nil {
		http.Error(w, "update failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
