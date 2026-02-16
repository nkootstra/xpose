package tui

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestRenderTrafficLine_ContainsMethod(t *testing.T) {
	ts := time.Date(2025, 1, 15, 14, 30, 45, 0, time.UTC)
	line := RenderTrafficLine("GET", "/api/test", 200, 42*time.Millisecond, ts)
	assert.Contains(t, line, "GET")
	assert.Contains(t, line, "/api/test")
	assert.Contains(t, line, "42ms")
}

func TestRenderTrafficLine_TruncatesLongPaths(t *testing.T) {
	ts := time.Now()
	longPath := strings.Repeat("a", 50)
	line := RenderTrafficLine("POST", longPath, 201, 100*time.Millisecond, ts)
	// The path should be truncated to 30 chars
	assert.Contains(t, line, strings.Repeat("a", 30))
}

func TestRenderTrafficLine_DifferentStatuses(t *testing.T) {
	ts := time.Now()
	cases := []struct {
		status int
	}{
		{200},
		{301},
		{404},
		{500},
	}
	for _, tc := range cases {
		line := RenderTrafficLine("GET", "/", tc.status, time.Millisecond, ts)
		assert.NotEmpty(t, line)
	}
}

func TestFormatTTL(t *testing.T) {
	tests := []struct {
		seconds  int
		expected string
	}{
		{3600, "1h 0m 0s"},
		{14400, "4h 0m 0s"},
		{3661, "1h 1m 1s"},
		{90, "0h 1m 30s"},
		{0, "0h 0m 0s"},
	}
	for _, tc := range tests {
		assert.Equal(t, tc.expected, FormatTTL(tc.seconds))
	}
}
