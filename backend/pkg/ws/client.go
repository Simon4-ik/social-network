package ws

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
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
		if err == nil {
			for rows.Next() {
				var uid string
				if err := rows.Scan(&uid); err == nil {
					s.Hub.SendTo(uid, ev)
				}
			}
			rows.Close()
		}
	}
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
