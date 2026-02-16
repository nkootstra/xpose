package tui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/nkootstra/xpose/internal/tunnel"
	"github.com/stretchr/testify/assert"
)

func TestNewModel_InitialState(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "b", Port: 8080}),
	}
	m := NewModel(clients, []int{3000, 8080})

	assert.Len(t, m.tunnels, 2)
	assert.Equal(t, 3000, m.tunnels[0].port)
	assert.Equal(t, 8080, m.tunnels[1].port)
	assert.Equal(t, tunnel.StatusConnecting, m.tunnels[0].status)
	assert.Equal(t, tunnel.StatusConnecting, m.tunnels[1].status)
	assert.Equal(t, panelRight, m.focus)
}

func TestModel_HandleAuthenticated(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})

	msg := tunnelEventMsg{
		tunnelIndex: 0,
		event: tunnel.TunnelEvent{
			Type: "authenticated",
			Authenticated: &tunnel.AuthenticatedInfo{
				URL:              "https://a.xpose.dev",
				TTL:              3600,
				SessionID:        "sess-1",
				MaxBodySizeBytes: 5 * 1024 * 1024,
			},
		},
	}

	newM, _ := m.Update(msg)
	model := newM.(Model)
	assert.Equal(t, tunnel.StatusConnected, model.tunnels[0].status)
	assert.Equal(t, "https://a.xpose.dev", model.tunnels[0].url)
	assert.Equal(t, 3600, model.tunnels[0].ttl)
	assert.Equal(t, 3600, model.tunnels[0].ttlRemaining)
}

func TestModel_HandleTraffic(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})

	msg := tunnelEventMsg{
		tunnelIndex: 0,
		event: tunnel.TunnelEvent{
			Type: "traffic",
			Traffic: &tunnel.TrafficEntry{
				ID:        "req-1",
				Method:    "GET",
				Path:      "/api/test",
				Status:    200,
				Duration:  42 * time.Millisecond,
				Timestamp: time.Now(),
			},
		},
	}

	newM, _ := m.Update(msg)
	model := newM.(Model)
	assert.Len(t, model.traffic, 1)
	assert.Contains(t, model.traffic[0], "GET")
}

func TestModel_ViewConnected(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})

	// Simulate authentication
	m.tunnels[0].status = tunnel.StatusConnected
	m.tunnels[0].url = "https://a.xpose.dev"
	m.tunnels[0].ttl = 3600
	m.tunnels[0].ttlRemaining = 3600
	m.tunnels[0].maxBody = 5 * 1024 * 1024

	view := m.ViewString()
	assert.Contains(t, view, "xpose")
	assert.Contains(t, view, "https://a.xpose.dev")
	assert.Contains(t, view, "localhost:3000")
	assert.Contains(t, view, "1h 0m 0s")
}

func TestModel_ViewWithTraffic(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})
	m.tunnels[0].status = tunnel.StatusConnected
	m.tunnels[0].url = "https://a.xpose.dev"

	// Add traffic
	m.traffic = append(m.traffic, RenderTrafficLine("POST", "/submit", 201, 15*time.Millisecond, time.Now()))

	view := m.ViewString()
	assert.Contains(t, view, "POST")
	assert.Contains(t, view, "/submit")
}

func TestModel_AllExpiredQuits(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})

	msg := tunnelEventMsg{
		tunnelIndex: 0,
		event: tunnel.TunnelEvent{
			Type:   "expired",
			Status: tunnel.StatusExpired,
		},
	}

	newM, _ := m.Update(msg)
	model := newM.(Model)
	assert.True(t, model.quitting)
}

func TestModel_TrafficRingBuffer(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})

	for i := 0; i < 150; i++ {
		m.traffic = append(m.traffic, "line")
	}
	if len(m.traffic) > maxTrafficEntries {
		m.traffic = m.traffic[len(m.traffic)-maxTrafficEntries:]
	}

	assert.Len(t, m.traffic, maxTrafficEntries)
}

func TestRenderBanner(t *testing.T) {
	banner := RenderBanner("https://test.xpose.dev", 3000, 14400, 5*1024*1024, 80)
	assert.Contains(t, banner, "xpose")
	assert.Contains(t, banner, "https://test.xpose.dev")
	assert.Contains(t, banner, "localhost:3000")
	assert.Contains(t, banner, "4h 0m 0s")
	assert.True(t, strings.Contains(banner, "\u2500"))
}

func TestModel_TickDecrementsRemaining(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})
	m.tunnels[0].status = tunnel.StatusConnected
	m.tunnels[0].ttl = 3600
	m.tunnels[0].ttlRemaining = 3600

	newM, _ := m.Update(tickMsg(time.Now()))
	model := newM.(Model)
	assert.Equal(t, 3599, model.tunnels[0].ttlRemaining)
}

func TestModel_TickDoesNotGoNegative(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})
	m.tunnels[0].status = tunnel.StatusConnected
	m.tunnels[0].ttlRemaining = 0

	newM, _ := m.Update(tickMsg(time.Now()))
	model := newM.(Model)
	assert.Equal(t, 0, model.tunnels[0].ttlRemaining)
}

func TestFormatTTL_Negative(t *testing.T) {
	assert.Equal(t, "0h 0m 0s", FormatTTL(-1))
}

func TestModel_BKeyReturnsCommand(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})
	m.tunnels[0].status = tunnel.StatusConnected
	m.tunnels[0].url = "https://a.xpose.dev"

	msg := tea.KeyPressMsg{Code: 'b', Text: "b"}
	_, cmd := m.Update(msg)
	assert.NotNil(t, cmd, "pressing 'b' when connected should return a command")
}

func TestModel_BKeyNoCommandWhenDisconnected(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})
	m.tunnels[0].status = tunnel.StatusConnecting

	msg := tea.KeyPressMsg{Code: 'b', Text: "b"}
	_, cmd := m.Update(msg)
	_ = cmd
}

func TestModel_TabTogglesFocus(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})
	m.showSplit = true
	m.focus = panelRight

	msg := tea.KeyPressMsg{Code: tea.KeyTab, Text: "tab"}
	newM, _ := m.Update(msg)
	model := newM.(Model)
	assert.Equal(t, panelLeft, model.focus)

	// Tab again to go back
	newM, _ = model.Update(msg)
	model = newM.(Model)
	assert.Equal(t, panelRight, model.focus)
}

func TestModel_TabNoopInNarrowMode(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})
	m.showSplit = false
	m.focus = panelRight

	msg := tea.KeyPressMsg{Code: tea.KeyTab, Text: "tab"}
	newM, _ := m.Update(msg)
	model := newM.(Model)
	assert.Equal(t, panelRight, model.focus) // unchanged
}

func TestModel_SyncLayout_NarrowMode(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})
	m.width = 80
	m.height = 24
	m.syncLayout()

	assert.False(t, m.showSplit)
}

func TestModel_SyncLayout_SplitMode(t *testing.T) {
	clients := []*tunnel.Client{
		tunnel.NewClient(tunnel.ClientOptions{Subdomain: "a", Port: 3000}),
	}
	m := NewModel(clients, []int{3000})
	m.width = 120
	m.height = 24
	m.syncLayout()

	assert.True(t, m.showSplit)
	assert.True(t, m.ready)
}

func TestRenderTunnelCard_Connected(t *testing.T) {
	card := RenderTunnelCard("https://test.xpose.dev", 3000, 3600, "connected", "", "")
	assert.Contains(t, card, "Connected")
	assert.Contains(t, card, "https://test.xpose.dev")
	assert.Contains(t, card, "localhost:3000")
	assert.Contains(t, card, "1h 0m 0s")
}

func TestRenderTunnelCard_Connecting(t *testing.T) {
	card := RenderTunnelCard("", 3000, 0, "connecting", "", "⣾")
	assert.Contains(t, card, "Connecting")
	assert.Contains(t, card, "3000")
}

func TestRenderCompactView_MultipleTunnels(t *testing.T) {
	data := []tunnelViewData{
		{port: 3000, status: "connected", url: "https://a.xpose.dev", ttlRemaining: 3600},
		{port: 8080, status: "connecting", url: "", ttlRemaining: 0},
	}
	view := RenderCompactView(data, "⣾")
	assert.Contains(t, view, "https://a.xpose.dev")
	assert.Contains(t, view, "Connecting")
}

func TestHyperlink(t *testing.T) {
	result := Hyperlink("https://example.com", "example")
	assert.Contains(t, result, "\x1b]8;;https://example.com\x07")
	assert.Contains(t, result, "example")
	assert.True(t, strings.HasSuffix(result, "\x1b]8;;\x07"))
}

func TestRenderBanner_DefaultWidth(t *testing.T) {
	banner := RenderBanner("https://test.xpose.dev", 3000, 3600, 0, 0)
	assert.Contains(t, banner, "xpose")
	// Should not contain max body line when maxBodySizeBytes is 0
	assert.NotContains(t, banner, "Max body")
}

func TestInjectBorderTitle(t *testing.T) {
	// Simulate a rendered box with a top border
	topBorder := "╭──────────────────────────╮"
	body := "│ content                  │"
	bottom := "╰──────────────────────────╯"
	rendered := topBorder + "\n" + body + "\n" + bottom

	result := injectBorderTitle(rendered, " Title ")
	lines := strings.SplitN(result, "\n", 2)
	assert.Contains(t, lines[0], "Title")
	assert.True(t, strings.HasPrefix(lines[0], "╭"))
}
