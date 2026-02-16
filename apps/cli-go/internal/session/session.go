package session

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/nkootstra/xpose/internal/protocol"
)

const sessionFileName = "session.json"

// configDirOverride is set during tests to avoid polluting the real config.
var configDirOverride string

// TunnelEntry records one tunnel's identity so it can be resumed.
type TunnelEntry struct {
	Subdomain string `json:"subdomain"`
	Port      int    `json:"port"`
	Domain    string `json:"domain"`
}

// Session is the on-disk representation of a resumable tunnel session.
type Session struct {
	Tunnels   []TunnelEntry `json:"tunnels"`
	CreatedAt time.Time     `json:"createdAt"`
}

// configDir returns the xpose config directory, creating it if necessary when create is true.
func configDir(create bool) (string, error) {
	var dir string
	if configDirOverride != "" {
		dir = configDirOverride
	} else {
		base, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(base, "xpose")
	}
	if create {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return "", err
		}
	}
	return dir, nil
}

// sessionPath returns the full path to the session file.
func sessionPath(create bool) (string, error) {
	dir, err := configDir(create)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, sessionFileName), nil
}

// Save writes the session to disk.
func Save(s *Session) error {
	path, err := sessionPath(true)
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// Load reads the session from disk. Returns nil (with no error) if the file
// does not exist or the session has expired.
func Load() (*Session, error) {
	path, err := sessionPath(false)
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}

	var s Session
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, nil // treat corrupt file as missing
	}

	window := time.Duration(protocol.SessionResumeWindowSeconds) * time.Second
	if time.Since(s.CreatedAt) > window {
		return nil, nil // expired
	}

	return &s, nil
}

// Clear removes the session file.
func Clear() error {
	path, err := sessionPath(false)
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
