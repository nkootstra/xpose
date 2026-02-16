package session

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestDir(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	configDirOverride = tmp
	t.Cleanup(func() { configDirOverride = "" })
}

func TestSaveAndLoad(t *testing.T) {
	setupTestDir(t)

	s := &Session{
		Tunnels: []TunnelEntry{
			{Subdomain: "abc123", Port: 3000, Domain: "xpose.dev"},
			{Subdomain: "def456", Port: 8080, Domain: "xpose.dev"},
		},
		CreatedAt: time.Now(),
	}

	err := Save(s)
	require.NoError(t, err)

	loaded, err := Load()
	require.NoError(t, err)
	require.NotNil(t, loaded)

	assert.Len(t, loaded.Tunnels, 2)
	assert.Equal(t, "abc123", loaded.Tunnels[0].Subdomain)
	assert.Equal(t, 3000, loaded.Tunnels[0].Port)
	assert.Equal(t, "def456", loaded.Tunnels[1].Subdomain)
	assert.Equal(t, 8080, loaded.Tunnels[1].Port)
}

func TestLoad_MissingFile(t *testing.T) {
	setupTestDir(t)

	loaded, err := Load()
	assert.NoError(t, err)
	assert.Nil(t, loaded)
}

func TestLoad_ExpiredSession(t *testing.T) {
	setupTestDir(t)

	s := &Session{
		Tunnels: []TunnelEntry{
			{Subdomain: "abc123", Port: 3000, Domain: "xpose.dev"},
		},
		CreatedAt: time.Now().Add(-11 * time.Minute),
	}

	err := Save(s)
	require.NoError(t, err)

	loaded, err := Load()
	assert.NoError(t, err)
	assert.Nil(t, loaded, "expired session should return nil")
}

func TestLoad_CorruptFile(t *testing.T) {
	setupTestDir(t)

	require.NoError(t, os.WriteFile(filepath.Join(configDirOverride, sessionFileName), []byte("not json"), 0o644))

	loaded, err := Load()
	assert.NoError(t, err)
	assert.Nil(t, loaded, "corrupt file should return nil")
}

func TestClear(t *testing.T) {
	setupTestDir(t)

	s := &Session{
		Tunnels:   []TunnelEntry{{Subdomain: "abc123", Port: 3000, Domain: "xpose.dev"}},
		CreatedAt: time.Now(),
	}
	require.NoError(t, Save(s))

	err := Clear()
	assert.NoError(t, err)

	loaded, err := Load()
	assert.NoError(t, err)
	assert.Nil(t, loaded, "after Clear, Load should return nil")
}

func TestClear_NoFile(t *testing.T) {
	setupTestDir(t)

	err := Clear()
	assert.NoError(t, err, "Clear on missing file should not error")
}

func TestSessionJSON_RoundTrip(t *testing.T) {
	s := &Session{
		Tunnels: []TunnelEntry{
			{Subdomain: "test", Port: 4000, Domain: "example.com"},
		},
		CreatedAt: time.Date(2026, 2, 16, 12, 0, 0, 0, time.UTC),
	}

	data, err := json.MarshalIndent(s, "", "  ")
	require.NoError(t, err)

	var loaded Session
	require.NoError(t, json.Unmarshal(data, &loaded))
	assert.Equal(t, s.Tunnels[0].Subdomain, loaded.Tunnels[0].Subdomain)
	assert.Equal(t, s.Tunnels[0].Port, loaded.Tunnels[0].Port)
	assert.Equal(t, s.Tunnels[0].Domain, loaded.Tunnels[0].Domain)
}
