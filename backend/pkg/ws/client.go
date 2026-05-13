package ws

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"social-network/pkg/auth"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Client struct {
	UserID string
	Conn   *websocket.Conn
	Send   chan Envelope
}

type Server struct {
	Hub *Hub
	DB  *sql.DB
}

func New(db *sql.DB) *Server {
	return &Server{Hub: NewHub(), DB: db}
}

// GET /api/ws
func (s *Server) Handle(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	c := &Client{UserID: userID, Conn: conn, Send: make(chan Envelope, 32)}
	s.Hub.Register(c)
	go s.writer(c)
	s.reader(c)
}

func (s *Server) writer(c *Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()
	for {
		select {
		case env, ok := <-c.Send:
			if !ok {
				return
			}
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteJSON(env); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *Server) reader(c *Client) {
	defer func() {
		s.Hub.Unregister(c)
		c.Conn.Close()
	}()
	c.Conn.SetReadLimit(64 * 1024)
	_ = c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		return c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})
	for {
		_, raw, err := c.Conn.ReadMessage()
		if err != nil {
			return
		}
		var env Envelope
		if err := json.Unmarshal(raw, &env); err != nil {
			continue
		}
		s.handleEnvelope(c, env)
	}
}

type dmPayload struct {
	To      string `json:"to"`
	Content string `json:"content"`
}

type groupPayload struct {
	GroupID string `json:"group_id"`
	Content string `json:"content"`
}

func (s *Server) handleEnvelope(c *Client, env Envelope) {
	switch env.Type {
	case "dm":
		var p dmPayload
		if err := json.Unmarshal(env.Payload, &p); err != nil || p.Content == "" || p.To == "" {
			return
		}
		if !s.canDM(c.UserID, p.To) {
			return
		}
		id := newID()
		now := time.Now().UTC().Format(time.RFC3339)
		_, err := s.DB.Exec(`INSERT INTO messages (id, sender_id, recipient_id, content) VALUES (?, ?, ?, ?)`, id, c.UserID, p.To, p.Content)
		if err != nil {
			return
		}
		out := map[string]any{
			"id": id, "from": c.UserID, "to": p.To, "content": p.Content, "created_at": now,
		}
		body, _ := json.Marshal(out)
		ev := Envelope{Type: "dm", Payload: body}
		s.Hub.SendTo(p.To, ev)
		s.Hub.SendTo(c.UserID, ev)
		s.notify(p.To, "dm_message", map[string]any{
			"from":      c.UserID,
			"from_name": s.userName(c.UserID),
			"content":   snippet(p.Content),
		})

	case "group":
		var p groupPayload
		if err := json.Unmarshal(env.Payload, &p); err != nil || p.Content == "" || p.GroupID == "" {
			return
		}
		if !s.isGroupMember(c.UserID, p.GroupID) {
			return
		}
		id := newID()
		now := time.Now().UTC().Format(time.RFC3339)
		_, err := s.DB.Exec(`INSERT INTO messages (id, sender_id, group_id, content) VALUES (?, ?, ?, ?)`, id, c.UserID, p.GroupID, p.Content)
		if err != nil {
			return
		}
		out := map[string]any{
			"id": id, "from": c.UserID, "group_id": p.GroupID, "content": p.Content, "created_at": now,
		}
		body, _ := json.Marshal(out)
		ev := Envelope{Type: "group", Payload: body}
		// fan out to all group members
		rows, err := s.DB.Query(`SELECT user_id FROM group_members WHERE group_id = ?`, p.GroupID)
		recipients := []string{}
		if err == nil {
			for rows.Next() {
				var uid string
				if err := rows.Scan(&uid); err == nil {
					s.Hub.SendTo(uid, ev)
					if uid != c.UserID {
						recipients = append(recipients, uid)
					}
				}
			}
			rows.Close()
		}
		if len(recipients) > 0 {
			fromName := s.userName(c.UserID)
			groupTitle := s.groupTitle(p.GroupID)
			snip := snippet(p.Content)
			for _, uid := range recipients {
				s.notify(uid, "group_message", map[string]any{
					"group_id":    p.GroupID,
					"group_title": groupTitle,
					"from":        c.UserID,
					"from_name":   fromName,
					"content":     snip,
				})
			}
		}
	}
}

// notify inserts a notifications row and pushes a "notification" WS event.
// Lives in this package (instead of pkg/notify) to avoid an import cycle.
func (s *Server) notify(userID, typ string, payload map[string]any) {
	if s.DB == nil {
		return
	}
	id := newID()
	body, _ := json.Marshal(payload)
	_, err := s.DB.Exec(`INSERT INTO notifications (id, user_id, type, payload) VALUES (?, ?, ?, ?)`,
		id, userID, typ, string(body))
	if err != nil {
		return
	}
	evPayload, _ := json.Marshal(map[string]any{
		"id": id, "type": typ, "payload": payload,
	})
	s.Hub.SendTo(userID, Envelope{Type: "notification", Payload: evPayload})
}

func (s *Server) userName(id string) string {
	var fn, ln string
	_ = s.DB.QueryRow(`SELECT first_name, last_name FROM users WHERE id = ?`, id).Scan(&fn, &ln)
	return strings.TrimSpace(fn + " " + ln)
}

func (s *Server) groupTitle(id string) string {
	var t string
	_ = s.DB.QueryRow(`SELECT title FROM groups WHERE id = ?`, id).Scan(&t)
	return t
}

func snippet(s string) string {
	const max = 80
	s = strings.TrimSpace(s)
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}

func (s *Server) canDM(a, b string) bool {
	// allowed if either user follows the other (accepted) OR target is public
	var n int
	_ = s.DB.QueryRow(`
		SELECT COUNT(*) FROM followers
		WHERE status='accepted' AND (
		    (follower_id = ? AND following_id = ?) OR
		    (follower_id = ? AND following_id = ?)
		)`, a, b, b, a).Scan(&n)
	if n > 0 {
		return true
	}
	var pub int
	_ = s.DB.QueryRow(`SELECT is_public FROM users WHERE id = ?`, b).Scan(&pub)
	return pub == 1
}

func (s *Server) isGroupMember(userID, groupID string) bool {
	var n int
	_ = s.DB.QueryRow(`SELECT COUNT(*) FROM group_members WHERE group_id = ? AND user_id = ?`, groupID, userID).Scan(&n)
	return n > 0
}
