package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"social-network/pkg/auth"
	"social-network/pkg/models"
)

type Auth struct {
	DB       *sql.DB
	Sessions *auth.Manager
}

type registerReq struct {
	Email       string  `json:"email"`
	Password    string  `json:"password"`
	FirstName   string  `json:"first_name"`
	LastName    string  `json:"last_name"`
	DateOfBirth string  `json:"date_of_birth"`
	AvatarPath  *string `json:"avatar_path,omitempty"`
	Nickname    *string `json:"nickname,omitempty"`
	AboutMe     *string `json:"about_me,omitempty"`
}

func (a *Auth) Register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" || req.FirstName == "" || req.LastName == "" || req.DateOfBirth == "" {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", req.DateOfBirth); err != nil {
		http.Error(w, "date_of_birth must be YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "hash error", http.StatusInternalServerError)
		return
	}
	id := uuid.NewString()
	_, err = a.DB.Exec(`
		INSERT INTO users (id, email, password_hash, first_name, last_name, date_of_birth, avatar_path, nickname, about_me)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, req.Email, string(hash), req.FirstName, req.LastName, req.DateOfBirth, req.AvatarPath, req.Nickname, req.AboutMe,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			http.Error(w, "email already in use", http.StatusConflict)
			return
		}
		http.Error(w, "create user failed", http.StatusInternalServerError)
		return
	}

	sid, exp, err := a.Sessions.Create(id)
	if err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	a.Sessions.SetCookie(w, sid, exp)
	writeJSON(w, http.StatusCreated, map[string]string{"id": id, "email": req.Email})
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	var u models.User
	err := a.DB.QueryRow(`SELECT id, email, password_hash FROM users WHERE email = ?`, req.Email).
		Scan(&u.ID, &u.Email, &u.PasswordHash)
	if errors.Is(err, sql.ErrNoRows) || err != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)); err != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	sid, exp, err := a.Sessions.Create(u.ID)
	if err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	a.Sessions.SetCookie(w, sid, exp)
	writeJSON(w, http.StatusOK, map[string]string{"id": u.ID, "email": u.Email})
}

func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.CookieName); err == nil {
		_ = a.Sessions.Delete(c.Value)
	}
	a.Sessions.ClearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (a *Auth) Me(w http.ResponseWriter, r *http.Request) {
	uid := auth.UserID(r)
	var u models.User
	err := a.DB.QueryRow(`
		SELECT id, email, first_name, last_name, date_of_birth, avatar_path, nickname, about_me, is_public, created_at
		FROM users WHERE id = ?`, uid).
		Scan(&u.ID, &u.Email, &u.FirstName, &u.LastName, &u.DateOfBirth, &u.AvatarPath, &u.Nickname, &u.AboutMe, &u.IsPublic, &u.CreatedAt)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
