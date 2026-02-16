package tui

import (
	"fmt"
	"strings"

	"charm.land/bubbles/v2/spinner"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/xpose-dev/xpose/internal/tunnel"
)

const maxTrafficEntries = 100

// tunnelState tracks the state of a single tunnel connection.
type tunnelState struct {
	port      int
	status    tunnel.TunnelStatus
	url       string
	ttl       int
	maxBody   int
	sessionID string
	lastError string
}

// Model is the root Bubble Tea model for the xpose TUI.
type Model struct {
	clients  []*tunnel.Client
	tunnels  []tunnelState
	traffic  []string
	spinner  spinner.Model
	quitting bool
	width    int
	height   int
}

// NewModel creates a new TUI model with the given tunnel clients and ports.
func NewModel(clients []*tunnel.Client, ports []int) Model {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))

	tunnels := make([]tunnelState, len(clients))
	for i, port := range ports {
		tunnels[i] = tunnelState{
			port:   port,
			status: tunnel.StatusConnecting,
		}
	}

	return Model{
		clients: clients,
		tunnels: tunnels,
		traffic: make([]string, 0, maxTrafficEntries),
		spinner: s,
	}
}

// Init sets up event listeners and the spinner.
func (m Model) Init() tea.Cmd {
	cmds := make([]tea.Cmd, 0, len(m.clients)+1)
	cmds = append(cmds, m.spinner.Tick)
	for i, client := range m.clients {
		cmds = append(cmds, listenForEvents(client, i))
	}
	return tea.Batch(cmds...)
}

// Update handles messages and updates model state.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			m.quitting = true
			for _, c := range m.clients {
				c.Disconnect()
			}
			return m, tea.Quit
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case tunnelEventMsg:
		idx := msg.tunnelIndex
		ev := msg.event

		switch ev.Type {
		case "status":
			m.tunnels[idx].status = ev.Status

		case "authenticated":
			if ev.Authenticated != nil {
				m.tunnels[idx].url = ev.Authenticated.URL
				m.tunnels[idx].ttl = ev.Authenticated.TTL
				m.tunnels[idx].maxBody = ev.Authenticated.MaxBodySizeBytes
				m.tunnels[idx].sessionID = ev.Authenticated.SessionID
				m.tunnels[idx].status = tunnel.StatusConnected
			}

		case "traffic":
			if ev.Traffic != nil {
				portPrefix := ""
				if len(m.clients) > 1 {
					portPrefix = fmt.Sprintf("[%d] ", m.tunnels[idx].port)
				}
				line := RenderTrafficLine(
					ev.Traffic.Method,
					portPrefix+ev.Traffic.Path,
					ev.Traffic.Status,
					ev.Traffic.Duration,
					ev.Traffic.Timestamp,
				)
				m.traffic = append(m.traffic, line)
				if len(m.traffic) > maxTrafficEntries {
					m.traffic = m.traffic[len(m.traffic)-maxTrafficEntries:]
				}
			}

		case "error":
			if ev.Error != nil {
				m.tunnels[idx].lastError = ev.Error.Error()
			}

		case "expired":
			m.tunnels[idx].status = tunnel.StatusExpired
			// Check if all tunnels have expired
			allExpired := true
			for _, t := range m.tunnels {
				if t.status != tunnel.StatusExpired {
					allExpired = false
					break
				}
			}
			if allExpired {
				m.quitting = true
				return m, tea.Quit
			}
		}

		// Re-listen for the next event from this tunnel
		return m, listenForEvents(m.clients[idx], idx)
	}

	return m, nil
}

// View renders the TUI display.
func (m Model) View() tea.View {
	if m.quitting {
		return tea.NewView("")
	}

	var b strings.Builder

	// Render banners for connected tunnels
	for _, t := range m.tunnels {
		switch t.status {
		case tunnel.StatusConnected:
			b.WriteString(RenderBanner(t.url, t.port, t.ttl, t.maxBody))

		case tunnel.StatusConnecting:
			b.WriteString(fmt.Sprintf("\n  %s %s\n",
				m.spinner.View(),
				StyledTunnelStatus("connecting"),
			))

		case tunnel.StatusReconnecting:
			b.WriteString(fmt.Sprintf("\n  %s %s\n",
				m.spinner.View(),
				StyledTunnelStatus("reconnecting"),
			))

		case tunnel.StatusDisconnected:
			b.WriteString(fmt.Sprintf("\n  %s\n", StyledTunnelStatus("disconnected")))

		case tunnel.StatusExpired:
			b.WriteString(fmt.Sprintf("\n  %s\n", StyledTunnelStatus("expired")))
		}

		if t.lastError != "" && t.status != tunnel.StatusConnected {
			b.WriteString(fmt.Sprintf("  %s %s\n",
				errorStyle.Render("Error:"),
				t.lastError,
			))
		}
	}

	// Render traffic log
	if len(m.traffic) > 0 {
		for _, line := range m.traffic {
			b.WriteString(line + "\n")
		}
	}

	return tea.NewView(b.String())
}

// ViewString returns the View content as a plain string (for testing).
func (m Model) ViewString() string {
	var b strings.Builder

	if m.quitting {
		return ""
	}

	for _, t := range m.tunnels {
		switch t.status {
		case tunnel.StatusConnected:
			b.WriteString(RenderBanner(t.url, t.port, t.ttl, t.maxBody))
		case tunnel.StatusConnecting:
			b.WriteString(fmt.Sprintf("\n  %s\n", StyledTunnelStatus("connecting")))
		case tunnel.StatusReconnecting:
			b.WriteString(fmt.Sprintf("\n  %s\n", StyledTunnelStatus("reconnecting")))
		case tunnel.StatusDisconnected:
			b.WriteString(fmt.Sprintf("\n  %s\n", StyledTunnelStatus("disconnected")))
		case tunnel.StatusExpired:
			b.WriteString(fmt.Sprintf("\n  %s\n", StyledTunnelStatus("expired")))
		}
	}

	for _, line := range m.traffic {
		b.WriteString(line + "\n")
	}

	return b.String()
}
