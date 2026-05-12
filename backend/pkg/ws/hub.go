package ws

import (
	"encoding/json"
	"log"
	"sync"
)

type Envelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[*Client]struct{} // userID -> set of conns
}

func NewHub() *Hub {
	return &Hub{clients: make(map[string]map[*Client]struct{})}
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set, ok := h.clients[c.UserID]
	if !ok {
		set = make(map[*Client]struct{})
		h.clients[c.UserID] = set
	}
	set[c] = struct{}{}
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set, ok := h.clients[c.UserID]; ok {
		delete(set, c)
		if len(set) == 0 {
			delete(h.clients, c.UserID)
		}
	}
}

func (h *Hub) SendTo(userID string, env Envelope) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients[userID] {
		select {
		case c.Send <- env:
		default:
			log.Printf("ws: drop msg to %s (slow consumer)", userID)
		}
	}
}

func (h *Hub) Broadcast(userIDs []string, env Envelope) {
	for _, uid := range userIDs {
		h.SendTo(uid, env)
	}
}
