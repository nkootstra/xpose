package tui

import (
	"fmt"
	"strings"

	"charm.land/bubbles/v2/spinner"
	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/nkootstra/xpose/internal/tunnel"
)

const maxTrafficEntries = 100

// tunnelState tracks the state of a single tunnel connection.
type tunnelState struct {
	port         int
	status       tunnel.TunnelStatus
	url          string
	ttl          int // initial TTL from auth
	ttlRemaining int // seconds remaining (counts down)
	maxBody      int
	sessionID    string
	lastError    string
}

// Model is the root Bubble Tea model for the xpose TUI.
type Model struct {
	clients  []*tunnel.Client
	tunnels  []tunnelState
	traffic  []string
	spinner  spinner.Model
	viewport viewport.Model
	ready    bool
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

// headerHeight returns the number of lines occupied by the banner/header area.
func (m Model) headerHeight() int {
	var lines int
	for _, t := range m.tunnels {
		switch t.status {
		case tunnel.StatusConnected:
			lines += 9 // banner lines (with separator)
			if t.maxBody > 0 {
				lines++ // max body line
			}
		default:
			lines += 2 // status line
			if t.lastError != "" && t.status != tunnel.StatusConnected {
				lines++
			}
		}
	}
	return lines
}

const footerHeight = 1

// Init sets up event listeners, the spinner, and the TTL ticker.
func (m Model) Init() tea.Cmd {
	cmds := make([]tea.Cmd, 0, len(m.clients)+2)
	cmds = append(cmds, m.spinner.Tick)
	cmds = append(cmds, tickEvery())
	for i, client := range m.clients {
		cmds = append(cmds, listenForEvents(client, i))
	}
	return tea.Batch(cmds...)
}

// Update handles messages and updates model state.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

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

		vpHeight := m.height - m.headerHeight() - footerHeight
		if vpHeight < 1 {
			vpHeight = 1
		}

		if !m.ready {
			m.viewport = viewport.New(
				viewport.WithWidth(m.width),
				viewport.WithHeight(vpHeight),
			)
			m.viewport.MouseWheelEnabled = true
			m.viewport.MouseWheelDelta = 3
			m.updateViewportContent()
			m.ready = true
		} else {
			m.viewport.SetWidth(m.width)
			m.viewport.SetHeight(vpHeight)
		}

	case tickMsg:
		for i := range m.tunnels {
			if m.tunnels[i].status == tunnel.StatusConnected && m.tunnels[i].ttlRemaining > 0 {
				m.tunnels[i].ttlRemaining--
			}
		}
		cmds = append(cmds, tickEvery())

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
				m.tunnels[idx].ttlRemaining = ev.Authenticated.TTL
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
				m.updateViewportContent()
				m.viewport.GotoBottom()
			}

		case "error":
			if ev.Error != nil {
				m.tunnels[idx].lastError = ev.Error.Error()
			}

		case "expired":
			m.tunnels[idx].status = tunnel.StatusExpired
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

		cmds = append(cmds, listenForEvents(m.clients[idx], idx))
	}

	// Forward to viewport for scroll handling
	if m.ready {
		var vpCmd tea.Cmd
		m.viewport, vpCmd = m.viewport.Update(msg)
		cmds = append(cmds, vpCmd)
	}

	return m, tea.Batch(cmds...)
}

// updateViewportContent sets the viewport content from the traffic log.
func (m *Model) updateViewportContent() {
	if !m.ready {
		return
	}
	content := strings.Join(m.traffic, "\n")
	if len(m.traffic) == 0 {
		content = dimStyle.Render("  Waiting for requests...")
	}
	m.viewport.SetContent(content)
}

// View renders the TUI display.
func (m Model) View() tea.View {
	if m.quitting {
		return tea.NewView("")
	}

	var b strings.Builder

	// Fixed header: banners for all tunnels
	for _, t := range m.tunnels {
		switch t.status {
		case tunnel.StatusConnected:
			b.WriteString(RenderBanner(t.url, t.port, t.ttlRemaining, t.maxBody, m.width))

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

	// Scrollable traffic viewport
	if m.ready {
		b.WriteString(m.viewport.View())
		b.WriteString("\n")
	}

	// Footer
	footer := dimStyle.Render("  q quit | arrows/pgup/pgdn scroll")
	if m.ready {
		pct := m.viewport.ScrollPercent()
		if len(m.traffic) > 0 {
			footer = dimStyle.Render(fmt.Sprintf("  q quit | arrows/pgup/pgdn scroll | %3.0f%%", pct*100))
		}
	}
	b.WriteString(footer)

	v := tea.NewView(b.String())
	v.AltScreen = true
	v.MouseMode = tea.MouseModeCellMotion
	return v
}

// ViewString returns the View content as a plain string (for testing).
func (m Model) ViewString() string {
	if m.quitting {
		return ""
	}

	var b strings.Builder

	for _, t := range m.tunnels {
		switch t.status {
		case tunnel.StatusConnected:
			b.WriteString(RenderBanner(t.url, t.port, t.ttlRemaining, t.maxBody, m.width))
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
