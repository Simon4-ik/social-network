package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"social-network/pkg/auth"
	"social-network/pkg/notify"
)

type Posts struct {
	DB       *sql.DB
	Notifier *notify.Notifier
}

type createPostReq struct {
	Content       string   `json:"content"`
	ImagePath     *string  `json:"image_path,omitempty"`
	Privacy       string   `json:"privacy"`        // public | almost_private | private
	AllowedUsers  []string `json:"allowed_users"`  // only for private
	GroupID       *string  `json:"group_id,omitempty"`
}

// POST /api/posts
func (p *Posts) Create(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	var req createPostReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		http.Error(w, "content required", http.StatusBadRequest)
		return
	}

	privacy := req.Privacy
	if req.GroupID != nil {
		// group post — must be a member
		var n int
		_ = p.DB.QueryRow(`SELECT COUNT(*) FROM group_members WHERE group_id = ? AND user_id = ?`, *req.GroupID, me).Scan(&n)
		if n == 0 {
			http.Error(w, "not a group member", http.StatusForbidden)
			return
		}
		privacy = "group"
	} else {
		switch privacy {
		case "public", "almost_private", "private":
		default:
			http.Error(w, "bad privacy", http.StatusBadRequest)
			return
		}
	}

	tx, err := p.DB.Begin()
	if err != nil {
		http.Error(w, "tx error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	id := newUUID()
	_, err = tx.Exec(`INSERT INTO posts (id, user_id, group_id, content, image_path, privacy) VALUES (?, ?, ?, ?, ?, ?)`,
		id, me, req.GroupID, req.Content, req.ImagePath, privacy)
	if err != nil {
		http.Error(w, "insert failed", http.StatusInternalServerError)
		return
	}
	if privacy == "private" {
		for _, uid := range req.AllowedUsers {
			if uid == me {
				continue
			}
			_, _ = tx.Exec(`INSERT OR IGNORE INTO post_visibilities (post_id, user_id) VALUES (?, ?)`, id, uid)
		}
	}
	if err := tx.Commit(); err != nil {
		http.Error(w, "commit failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

type postOut struct {
	ID             string  `json:"id"`
	UserID         string  `json:"user_id"`
	AuthorName     string  `json:"author_name"`
	AuthorAvatar   *string `json:"author_avatar,omitempty"`
	Content        string  `json:"content"`
	ImagePath      *string `json:"image_path,omitempty"`
	Privacy        string  `json:"privacy"`
	GroupID        *string `json:"group_id,omitempty"`
	CreatedAt      string  `json:"created_at"`
	CommentCount   int     `json:"comment_count"`
}

// GET /api/feed
func (p *Posts) Feed(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	rows, err := p.DB.Query(`
		SELECT p.id, p.user_id, u.first_name || ' ' || u.last_name AS author, u.avatar_path,
		       p.content, p.image_path, p.privacy, p.group_id, p.created_at,
		       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
		FROM posts p JOIN users u ON u.id = p.user_id
		WHERE p.group_id IS NULL AND (
			p.user_id = ?
			OR p.privacy = 'public'
			OR (p.privacy = 'almost_private' AND EXISTS (
				SELECT 1 FROM followers f WHERE f.follower_id = ? AND f.following_id = p.user_id AND f.status='accepted'
			))
			OR (p.privacy = 'private' AND EXISTS (
				SELECT 1 FROM post_visibilities v WHERE v.post_id = p.id AND v.user_id = ?
			))
		)
		ORDER BY p.created_at DESC LIMIT 100`, me, me, me)
	if err != nil {
		http.Error(w, "query failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanPosts(rows))
}

// GET /api/users/{id}/posts
func (p *Posts) ByUser(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	target := r.PathValue("id")
	rows, err := p.DB.Query(`
		SELECT p.id, p.user_id, u.first_name || ' ' || u.last_name AS author, u.avatar_path,
		       p.content, p.image_path, p.privacy, p.group_id, p.created_at,
		       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
		FROM posts p JOIN users u ON u.id = p.user_id
		WHERE p.user_id = ? AND p.group_id IS NULL AND (
			p.user_id = ?
			OR p.privacy = 'public'
			OR (p.privacy = 'almost_private' AND EXISTS (
				SELECT 1 FROM followers f WHERE f.follower_id = ? AND f.following_id = p.user_id AND f.status='accepted'
			))
			OR (p.privacy = 'private' AND EXISTS (
				SELECT 1 FROM post_visibilities v WHERE v.post_id = p.id AND v.user_id = ?
			))
		)
		ORDER BY p.created_at DESC LIMIT 100`, target, me, me, me)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, scanPosts(rows))
}

func scanPosts(rows *sql.Rows) []postOut {
	out := []postOut{}
	for rows.Next() {
		var p postOut
		if err := rows.Scan(&p.ID, &p.UserID, &p.AuthorName, &p.AuthorAvatar, &p.Content, &p.ImagePath,
			&p.Privacy, &p.GroupID, &p.CreatedAt, &p.CommentCount); err == nil {
			out = append(out, p)
		}
	}
	return out
}

type createCommentReq struct {
	Content   string  `json:"content"`
	ImagePath *string `json:"image_path,omitempty"`
}

// POST /api/posts/{id}/comments
func (p *Posts) AddComment(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	postID := r.PathValue("id")

	if !p.canViewPost(me, postID) {
		http.Error(w, "not allowed", http.StatusForbidden)
		return
	}

	var req createCommentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" && req.ImagePath == nil {
		http.Error(w, "empty comment", http.StatusBadRequest)
		return
	}
	id := newUUID()
	_, err := p.DB.Exec(`INSERT INTO comments (id, post_id, user_id, content, image_path) VALUES (?, ?, ?, ?, ?)`,
		id, postID, me, req.Content, req.ImagePath)
	if err != nil {
		http.Error(w, "insert failed", http.StatusInternalServerError)
		return
	}
	var owner string
	_ = p.DB.QueryRow(`SELECT user_id FROM posts WHERE id = ?`, postID).Scan(&owner)
	if owner != "" && owner != me {
		p.Notifier.Send(owner, "post_comment", map[string]any{
			"post_id":    postID,
			"from":       me,
			"from_name":  p.Notifier.UserName(me),
			"comment_id": id,
		})
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// GET /api/posts/{id}/comments
func (p *Posts) ListComments(w http.ResponseWriter, r *http.Request) {
	me := auth.UserID(r)
	postID := r.PathValue("id")
	if !p.canViewPost(me, postID) {
		http.Error(w, "not allowed", http.StatusForbidden)
		return
	}
	rows, err := p.DB.Query(`
		SELECT c.id, c.user_id, u.first_name || ' ' || u.last_name AS author, u.avatar_path,
		       c.content, c.image_path, c.created_at
		FROM comments c JOIN users u ON u.id = c.user_id
		WHERE c.post_id = ? ORDER BY c.created_at ASC`, postID)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type out struct {
		ID           string  `json:"id"`
		UserID       string  `json:"user_id"`
		AuthorName   string  `json:"author_name"`
		AuthorAvatar *string `json:"author_avatar,omitempty"`
		Content      string  `json:"content"`
		ImagePath    *string `json:"image_path,omitempty"`
		CreatedAt    string  `json:"created_at"`
	}
	results := []out{}
	for rows.Next() {
		var c out
		if err := rows.Scan(&c.ID, &c.UserID, &c.AuthorName, &c.AuthorAvatar, &c.Content, &c.ImagePath, &c.CreatedAt); err == nil {
			results = append(results, c)
		}
	}
	writeJSON(w, http.StatusOK, results)
}

func (p *Posts) canViewPost(userID, postID string) bool {
	var ownerID, privacy string
	var groupID sql.NullString
	err := p.DB.QueryRow(`SELECT user_id, privacy, group_id FROM posts WHERE id = ?`, postID).Scan(&ownerID, &privacy, &groupID)
	if err != nil {
		return false
	}
	if ownerID == userID {
		return true
	}
	if groupID.Valid {
		var n int
		_ = p.DB.QueryRow(`SELECT COUNT(*) FROM group_members WHERE group_id = ? AND user_id = ?`, groupID.String, userID).Scan(&n)
		return n > 0
	}
	switch privacy {
	case "public":
		return true
	case "almost_private":
		var n int
		_ = p.DB.QueryRow(`SELECT COUNT(*) FROM followers WHERE follower_id = ? AND following_id = ? AND status='accepted'`, userID, ownerID).Scan(&n)
		return n > 0
	case "private":
		var n int
		_ = p.DB.QueryRow(`SELECT COUNT(*) FROM post_visibilities WHERE post_id = ? AND user_id = ?`, postID, userID).Scan(&n)
		return n > 0
	}
	return false
}
