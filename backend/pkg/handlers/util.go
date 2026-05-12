package handlers

import (
	"encoding/json"

	"github.com/google/uuid"
)

func newUUID() string { return uuid.NewString() }

func jsonOrEmpty(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}
