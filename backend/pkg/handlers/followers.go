package handlers

import (
	"database/sql"
	"net/http"

	"social-network/pkg/auth"
	"social-network/pkg/notify"
)

type Followers struct {
	DB       *sql.DB
	Notifier *notify.Notifier
}

// POST /api/users/{id}/follow
func (f *Followers) Follow(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	target := r.PathValue("id")
	if target == "" || target == me {
		http.Error(w, "bad target", http.StatusBadRequest)
		return
	}

	var isPublic bool
	if err := f.DB.QueryRow(`SELECT is_public FROM users WHERE id = ?`, target).Scan(&isPublic); err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	status := "pending"
	if isPublic {
		status = "accepted"
	}
	_, err := f.DB.Exec(`
		INSERT INTO followers (follower_id, following_id, status) VALUES (?, ?, ?)
		ON CONFLICT(follower_id, following_id) DO NOTHING`, me, target, status)
	if err != nil {
		http.Error(w, "follow failed", http.StatusInternalServerError)
		return
	}
	if status == "pending" {
		f.Notifier.Send(target, "follow_request", map[string]any{
			"from":      me,
			"from_name": f.Notifier.UserName(me),
		})
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": status})
}

// DELETE /api/users/{id}/follow  (unfollow OR cancel pending)
func (f *Followers) Unfollow(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	target := r.PathValue("id")
	_, err := f.DB.Exec(`DELETE FROM followers WHERE follower_id = ? AND following_id = ?`, me, target)
	if err != nil {
		http.Error(w, "unfollow failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/follow-requests/{follower_id}/accept
func (f *Followers) Accept(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	follower := r.PathValue("follower_id")
	res, err := f.DB.Exec(`UPDATE followers SET status='accepted' WHERE follower_id = ? AND following_id = ? AND status='pending'`, follower, me)
	if err != nil {
		http.Error(w, "accept failed", http.StatusInternalServerError)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		http.Error(w, "no pending request", http.StatusNotFound)
		return
	}
	f.Notifier.Send(follower, "follow_accepted", map[string]any{
		"by":      me,
		"by_name": f.Notifier.UserName(me),
	})
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/follow-requests/{follower_id}/decline
func (f *Followers) Decline(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	follower := r.PathValue("follower_id")
	_, err := f.DB.Exec(`DELETE FROM followers WHERE follower_id = ? AND following_id = ? AND status='pending'`, follower, me)
	if err != nil {
		http.Error(w, "decline failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/users/{id}/followers
func (f *Followers) ListFollowers(w http.ResponseWriter, r *http.Request) {
	target := r.PathValue("id")
	rows, err := f.DB.Query(`
		SELECT u.id, u.first_name, u.last_name, u.nickname, u.avatar_path
		FROM followers fl JOIN users u ON u.id = fl.follower_id
		WHERE fl.following_id = ? AND fl.status='accepted'`, target)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanMiniUsers(rows))
}

// GET /api/users/{id}/following
func (f *Followers) ListFollowing(w http.ResponseWriter, r *http.Request) {
	target := r.PathValue("id")
	rows, err := f.DB.Query(`
		SELECT u.id, u.first_name, u.last_name, u.nickname, u.avatar_path
		FROM followers fl JOIN users u ON u.id = fl.following_id
		WHERE fl.follower_id = ? AND fl.status='accepted'`, target)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanMiniUsers(rows))
}

// GET /api/follow-requests
func (f *Followers) PendingRequests(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	rows, err := f.DB.Query(`
		SELECT u.id, u.first_name, u.last_name, u.nickname, u.avatar_path
		FROM followers fl JOIN users u ON u.id = fl.follower_id
		WHERE fl.following_id = ? AND fl.status='pending'`, me)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanMiniUsers(rows))
}

type MiniUser struct {
	ID         string  `json:"id"`
	FirstName  string  `json:"first_name"`
	LastName   string  `json:"last_name"`
	Nickname   *string `json:"nickname,omitempty"`
	AvatarPath *string `json:"avatar_path,omitempty"`
}

func scanMiniUsers(rows *sql.Rows) []MiniUser {
	out := []MiniUser{}
	for rows.Next() {
		var u MiniUser
		if err := rows.Scan(&u.ID, &u.FirstName, &u.LastName, &u.Nickname, &u.AvatarPath); err == nil {
			out = append(out, u)
		}
	}
	return out
}
