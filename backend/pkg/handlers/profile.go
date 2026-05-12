package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"social-network/pkg/auth"
	"social-network/pkg/models"
)

type Profile struct {
	DB *sql.DB
}

// GET /api/users/{id}
func (p *Profile) Get(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	target := r.PathValue("id")

	var u models.User
	err := p.DB.QueryRow(`
		SELECT id, email, first_name, last_name, date_of_birth, avatar_path, nickname, about_me, is_public, created_at
		FROM users WHERE id = ?`, target).
		Scan(&u.ID, &u.Email, &u.FirstName, &u.LastName, &u.DateOfBirth, &u.AvatarPath, &u.Nickname, &u.AboutMe, &u.IsPublic, &u.CreatedAt)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	canView := target == me || u.IsPublic
	if !canView {
		var n int
		_ = p.DB.QueryRow(`SELECT COUNT(*) FROM followers WHERE follower_id = ? AND following_id = ? AND status='accepted'`, me, target).Scan(&n)
		canView = n > 0
	}

	resp := map[string]any{
		"id":          u.ID,
		"first_name":  u.FirstName,
		"last_name":   u.LastName,
		"nickname":    u.Nickname,
		"avatar_path": u.AvatarPath,
		"is_public":   u.IsPublic,
		"is_self":     target == me,
		"can_view":    canView,
	}
	if canView {
		resp["email"] = u.Email
		resp["date_of_birth"] = u.DateOfBirth
		resp["about_me"] = u.AboutMe
		resp["created_at"] = u.CreatedAt
	}
	writeJSON(w, http.StatusOK, resp)
}

type updateMeReq struct {
	AvatarPath *string `json:"avatar_path,omitempty"`
	Nickname   *string `json:"nickname,omitempty"`
	AboutMe    *string `json:"about_me,omitempty"`
}

// PUT /api/users/me
func (p *Profile) UpdateMe(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	var req updateMeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	_, err := p.DB.Exec(`
		UPDATE users SET
		    avatar_path = COALESCE(?, avatar_path),
		    nickname    = COALESCE(?, nickname),
		    about_me    = COALESCE(?, about_me)
		WHERE id = ?`, req.AvatarPath, req.Nickname, req.AboutMe, me)
	if err != nil {
		http.Error(w, "update failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type privacyReq struct {
	IsPublic bool `json:"is_public"`
}

// PUT /api/users/me/privacy
func (p *Profile) UpdatePrivacy(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	var req privacyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	_, err := p.DB.Exec(`UPDATE users SET is_public = ? WHERE id = ?`, boolToInt(req.IsPublic), me)
	if err != nil {
		http.Error(w, "update failed", http.StatusInternalServerError)
		return
	}
	// when switching to public, auto-accept any pending follow requests
	if req.IsPublic {
		_, _ = p.DB.Exec(`UPDATE followers SET status='accepted' WHERE following_id = ? AND status='pending'`, me)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"is_public": req.IsPublic})
}

// GET /api/users  (search/list)
func (p *Profile) List(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	rows, err := p.DB.Query(`
		SELECT id, first_name, last_name, nickname, avatar_path
		FROM users WHERE id <> ? ORDER BY first_name, last_name`, me)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanMiniUsers(rows))
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
