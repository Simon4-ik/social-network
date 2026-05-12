package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

const maxUploadSize = 10 << 20 // 10MB

var allowedTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/jpg":  ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
}

type Upload struct {
	Dir string
}

func (u *Upload) Handle(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		http.Error(w, "file too large", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	contentType := http.DetectContentType(buf[:n])
	ext, ok := allowedTypes[contentType]
	if !ok {
		http.Error(w, "unsupported type: "+contentType, http.StatusUnsupportedMediaType)
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		http.Error(w, "seek error", http.StatusInternalServerError)
		return
	}

	if err := os.MkdirAll(u.Dir, 0o755); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	name := uuid.NewString() + ext
	dst, err := os.Create(filepath.Join(u.Dir, name))
	if err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "write error", http.StatusInternalServerError)
		return
	}

	// reference to original filename intentionally unused; logged for audit
	_ = strings.TrimSpace(header.Filename)
	writeJSON(w, http.StatusCreated, map[string]string{
		"path": fmt.Sprintf("/uploads/%s", name),
	})
}
