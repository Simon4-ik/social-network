package auth

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/google/uuid"
)

const (
	CookieName     = "session_id"
	SessionTTL     = 7 * 24 * time.Hour
	ctxUserIDKey   = ctxKey("user_id")
)

type ctxKey string

type Manager struct {
	DB *sql.DB
}

func NewManager(db *sql.DB) *Manager { return &Manager{DB: db} }

func (m *Manager) Create(userID string) (string, time.Time, error) {
	id := uuid.NewString()
	exp := time.Now().Add(SessionTTL)
	_, err := m.DB.Exec(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`, id, userID, exp)
	if err != nil {
		return "", time.Time{}, err
	}
	return id, exp, nil
}

func (m *Manager) UserIDFromCookie(r *http.Request) (string, error) {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return "", err
	}
	var userID string
	var exp time.Time
	err = m.DB.QueryRow(`SELECT user_id, expires_at FROM sessions WHERE id = ?`, c.Value).Scan(&userID, &exp)
	if err != nil {
		return "", err
	}
	if time.Now().After(exp) {
		_, _ = m.DB.Exec(`DELETE FROM sessions WHERE id = ?`, c.Value)
		return "", http.ErrNoCookie
	}
	return userID, nil
}

func (m *Manager) Delete(sessionID string) error {
	_, err := m.DB.Exec(`DELETE FROM sessions WHERE id = ?`, sessionID)
	return err
}

func (m *Manager) SetCookie(w http.ResponseWriter, sessionID string, exp time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    sessionID,
		Path:     "/",
		Expires:  exp,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func (m *Manager) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func (m *Manager) Require(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := m.UserIDFromCookie(r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserIDKey, uid)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func UserID(r *http.Request) string {
	v, _ := r.Context().Value(ctxUserIDKey).(string)
	return v
}
