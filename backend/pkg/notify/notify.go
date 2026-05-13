package notify

import (
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/google/uuid"

	"social-network/pkg/ws"
)

type Notifier struct {
	DB  *sql.DB
	Hub *ws.Hub
}

func New(db *sql.DB, hub *ws.Hub) *Notifier {
	return &Notifier{DB: db, Hub: hub}
}

// Send inserts a notification row and pushes a WS event to the recipient.
func (n *Notifier) Send(userID, typ string, payload map[string]any) {
	if n == nil || n.DB == nil {
		return
	}
	id := uuid.NewString()
	b, _ := json.Marshal(payload)
	_, err := n.DB.Exec(`INSERT INTO notifications (id, user_id, type, payload) VALUES (?, ?, ?, ?)`,
		id, userID, typ, string(b))
	if err != nil {
		return
	}
	if n.Hub != nil {
		evPayload, _ := json.Marshal(map[string]any{
			"id":      id,
			"type":    typ,
			"payload": payload,
		})
		n.Hub.SendTo(userID, ws.Envelope{Type: "notification", Payload: evPayload})
	}
}

// UserName returns "First Last" for the given user id (empty if not found).
func (n *Notifier) UserName(id string) string {
	if n == nil || n.DB == nil {
		return ""
	}
	var fn, ln string
	_ = n.DB.QueryRow(`SELECT first_name, last_name FROM users WHERE id = ?`, id).Scan(&fn, &ln)
	return strings.TrimSpace(fn + " " + ln)
}

// GroupTitle returns the title for the given group id (empty if not found).
func (n *Notifier) GroupTitle(id string) string {
	if n == nil || n.DB == nil {
		return ""
	}
	var t string
	_ = n.DB.QueryRow(`SELECT title FROM groups WHERE id = ?`, id).Scan(&t)
	return t
}
