package turbo

import (
	"fmt"
	"testing"
)

func TestIsValidPort(t *testing.T) {
	tests := []struct {
		name  string
		value int
		want  bool
	}{
		{"zero is invalid", 0, false},
		{"one is valid", 1, true},
		{"typical port 3000", 3000, true},
		{"max valid port 65535", 65535, true},
		{"above max 65536", 65536, false},
		{"large invalid port 99999", 99999, false},
		{"negative is invalid", -1, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isValidPort(tt.value)
			if got != tt.want {
				t.Errorf("isValidPort(%d) = %v, want %v", tt.value, got, tt.want)
			}
		})
	}
}

func TestExtractExplicitPorts(t *testing.T) {
	tests := []struct {
		name    string
		command string
		want    []int
	}{
		{"PORT env variable", "PORT=3000 next dev", []int{3000}},
		{"port flag with space", "vite --port 5000", []int{5000}},
		{"port flag with equals", "vite --port=5000", []int{5000}},
		{"short port flag with space", "serve -p 4000", []int{4000}},
		{"short port flag without space", "serve -p4000", []int{4000}},
		{"listen flag with host and port (space)", "--listen 127.0.0.1:3000", []int{3000}},
		{"listen flag with host and port (equals)", "--listen=0.0.0.0:8080", []int{8080}},
		{"http URL with port and path", "http://localhost:3000/api", []int{3000}},
		{"https URL with port", "https://127.0.0.1:8443", []int{8443}},
		{"multiple ports in one command", "PORT=3000 vite --port 5173 http://localhost:8080", []int{3000, 5173, 8080}},
		{"no match returns empty", "next dev", nil},
		{"empty command returns empty", "", nil},
		{"invalid port 0 is filtered out", "PORT=0 next dev", nil},
		{"invalid port 99999 is filtered out", "PORT=99999 next dev", nil},
		{"duplicate ports are deduplicated", "PORT=3000 --port 3000", []int{3000}},
		{"listen flag with port only (no host)", "--listen 8080", []int{8080}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractExplicitPorts(tt.command)
			if !intSliceEqual(got, tt.want) {
				t.Errorf("extractExplicitPorts(%q) = %v, want %v", tt.command, got, tt.want)
			}
		})
	}
}

func TestInferDefaultPort(t *testing.T) {
	tests := []struct {
		name    string
		command string
		want    *int
	}{
		{"next dev defaults to 3000", "next dev", intPtr(3000)},
		{"nuxt dev defaults to 3000", "nuxt dev", intPtr(3000)},
		{"remix dev defaults to 3000", "remix dev", intPtr(3000)},
		{"wrangler dev defaults to 8787", "wrangler dev", intPtr(8787)},
		{"astro dev defaults to 4321", "astro dev", intPtr(4321)},
		{"vite defaults to 5173", "vite", intPtr(5173)},
		{"vite with args defaults to 5173", "vite build && vite", intPtr(5173)},
		{"vitest should NOT match vite", "vitest", nil},
		{"vitest run should NOT match vite", "vitest run", nil},
		{"start-storybook defaults to 6006", "start-storybook -p 9009", intPtr(6006)},
		{"storybook dev defaults to 6006", "storybook dev", intPtr(6006)},
		{"unknown command returns nil", "node server.js", nil},
		{"empty command returns nil", "", nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := inferDefaultPort(tt.command)
			if !intPtrEqual(got, tt.want) {
				t.Errorf("inferDefaultPort(%q) = %v, want %v", tt.command, intPtrStr(got), intPtrStr(tt.want))
			}
		})
	}
}

func intPtr(v int) *int       { return &v }
func intPtrEqual(a, b *int) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}
func intPtrStr(p *int) string {
	if p == nil {
		return "nil"
	}
	return fmt.Sprintf("%d", *p)
}
func intSliceEqual(a, b []int) bool {
	if len(a) == 0 && len(b) == 0 {
		return true
	}
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
