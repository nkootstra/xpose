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

const (
	maxTrafficEntries = 100
	minSplitWidth     = 100
	leftPanelPct      = 35
)

type focusedPanel int

const (
	panelLeft focusedPanel = iota
	panelRight
)

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
	clients   []*tunnel.Client
	tunnels   []tunnelState
	traffic   []string
	spinner   spinner.Model
	trafficVP viewport.Model // right panel: scrollable traffic log
	ready     bool
	quitting  bool
	width     int
	height    int

	// Split-pane state
	focus     focusedPanel
	showSplit bool
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
		focus:   panelRight, // default focus on traffic
	}
}

// tunnelViewDataSlice converts internal tunnel state to view data for rendering.
func (m Model) tunnelViewDataSlice() []tunnelViewData {
	data := make([]tunnelViewData, len(m.tunnels))
	for i, t := range m.tunnels {
		data[i] = tunnelViewData{
			port:         t.port,
			status:       string(t.status),
			url:          t.url,
			ttlRemaining: t.ttlRemaining,
			lastError:    t.lastError,
		}
	}
	return data
}

// renderLeftPanel builds the left panel content (tunnel info cards).
func (m Model) renderLeftPanel() string {
	var b strings.Builder
	for i, t := range m.tunnels {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString(RenderTunnelCard(
			t.url, t.port, t.ttlRemaining,
			string(t.status), t.lastError,
			m.spinner.View(),
		))
	}
	return b.String()
}

// renderFooter builds the footer string.
func (m Model) renderFooter() string {
	if m.showSplit {
		hint := "  q quit | b open browser | tab switch panel"
		if m.focus == panelRight && m.ready && len(m.traffic) > 0 {
			pct := m.trafficVP.ScrollPercent()
			hint += fmt.Sprintf(" | ↑↓ scroll | %3.0f%%", pct*100)
		}
		return dimStyle.Render(hint)
	}
	return dimStyle.Render("  q quit | b open browser")
}

// syncLayout recalculates viewport dimensions based on terminal size.
func (m *Model) syncLayout() {
	if m.width == 0 || m.height == 0 {
		return
	}

	m.showSplit = m.width >= minSplitWidth

	if !m.showSplit {
		// Narrow mode: no viewport needed, just tunnel cards
		return
	}

	// Split mode: left panel (tunnel info) + right panel (traffic viewport)
	const footerLines = 1
	borderV := 2 // top + bottom border
	borderH := 2 // left + right border

	leftWidth := m.width * leftPanelPct / 100
	rightWidth := m.width - leftWidth

	bodyHeight := m.height - footerLines

	vpWidth := rightWidth - borderH
	vpHeight := bodyHeight - borderV
	if vpWidth < 1 {
		vpWidth = 1
	}
	if vpHeight < 1 {
		vpHeight = 1
	}

	if !m.ready {
		m.trafficVP = viewport.New(
			viewport.WithWidth(vpWidth),
			viewport.WithHeight(vpHeight),
		)
		m.trafficVP.MouseWheelEnabled = true
		m.trafficVP.MouseWheelDelta = 3
		m.updateViewportContent()
		m.ready = true
	} else {
		m.trafficVP.SetWidth(vpWidth)
		m.trafficVP.SetHeight(vpHeight)
	}
}

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
		case "b":
			// Open the first connected tunnel URL in the browser.
			for _, t := range m.tunnels {
				if t.status == tunnel.StatusConnected && t.url != "" {
					return m, openBrowser(t.url)
				}
			}
		case "tab":
			if m.showSplit {
				if m.focus == panelLeft {
					m.focus = panelRight
				} else {
					m.focus = panelLeft
				}
			}
		}

	case openBrowserMsg:
		// Nothing to do — could show an error in a future iteration.

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.syncLayout()

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
				if m.ready {
					m.updateViewportContent()
					m.trafficVP.GotoBottom()
				}
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

	// Forward to viewport for scroll handling (only when focused on traffic)
	if m.ready && m.showSplit && m.focus == panelRight {
		var vpCmd tea.Cmd
		m.trafficVP, vpCmd = m.trafficVP.Update(msg)
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
		content = dimStyle.Render(" Waiting for requests...")
	}
	m.trafficVP.SetContent(content)
}

// View renders the TUI display.
func (m Model) View() tea.View {
	if m.quitting {
		return tea.NewView("")
	}

	var content string

	if !m.showSplit {
		// Narrow mode: compact tunnel cards only, no traffic
		content = m.renderNarrowView()
	} else {
		// Split mode: left (tunnels) + right (traffic) panels
		content = m.renderSplitView()
	}

	if m.height > 0 {
		content = lipgloss.PlaceVertical(m.height, lipgloss.Top, content)
	}

	v := tea.NewView(content)
	v.AltScreen = true
	v.MouseMode = tea.MouseModeCellMotion
	return v
}

// renderNarrowView renders the compact single-column view for narrow terminals.
func (m Model) renderNarrowView() string {
	cards := RenderCompactView(m.tunnelViewDataSlice(), m.spinner.View())
	footer := m.renderFooter()

	return lipgloss.JoinVertical(lipgloss.Left, cards, "", footer)
}

// renderSplitView renders the two-panel layout for wide terminals.
func (m Model) renderSplitView() string {
	const footerLines = 1
	borderV := 2 // top + bottom border
	borderH := 2 // left + right border

	leftWidth := m.width * leftPanelPct / 100
	rightWidth := m.width - leftWidth
	bodyHeight := m.height - footerLines

	// Build left panel content
	leftContent := m.renderLeftPanel()

	// Build right panel content
	var rightContent string
	if m.ready {
		rightContent = m.trafficVP.View()
	} else {
		rightContent = dimStyle.Render(" Initializing...")
	}

	// Choose border styles based on focus
	leftStyle := blurredBorderStyle()
	rightStyle := blurredBorderStyle()
	leftTitle := dimStyle.Render(" Tunnels ")
	rightTitle := dimStyle.Render(" Traffic ")

	if m.focus == panelLeft {
		leftStyle = focusedBorderStyle()
		leftTitle = panelTitleStyle.Render(" Tunnels ")
	} else {
		rightStyle = focusedBorderStyle()
		rightTitle = panelTitleStyle.Render(" Traffic ")
	}

	// Apply dimensions to panel styles.
	// Inner content dimensions = outer - border.
	leftInnerW := leftWidth - borderH
	leftInnerH := bodyHeight - borderV
	rightInnerW := rightWidth - borderH
	rightInnerH := bodyHeight - borderV

	if leftInnerW < 1 {
		leftInnerW = 1
	}
	if leftInnerH < 1 {
		leftInnerH = 1
	}
	if rightInnerW < 1 {
		rightInnerW = 1
	}
	if rightInnerH < 1 {
		rightInnerH = 1
	}

	leftPanel := leftStyle.
		Width(leftInnerW).
		Height(leftInnerH).
		BorderTop(true).
		BorderBottom(true).
		BorderLeft(true).
		BorderRight(true).
		Render(leftContent)

	// Inject panel title into top border of left panel
	leftPanel = injectBorderTitle(leftPanel, leftTitle)

	rightPanel := rightStyle.
		Width(rightInnerW).
		Height(rightInnerH).
		BorderTop(true).
		BorderBottom(true).
		BorderLeft(true).
		BorderRight(true).
		Render(rightContent)

	rightPanel = injectBorderTitle(rightPanel, rightTitle)

	body := lipgloss.JoinHorizontal(lipgloss.Top, leftPanel, rightPanel)
	footer := m.renderFooter()

	return lipgloss.JoinVertical(lipgloss.Left, body, footer)
}

// injectBorderTitle replaces the beginning of the first line (after the corner)
// with a styled title string, producing a "─ Title ─────" border top.
func injectBorderTitle(rendered string, title string) string {
	lines := strings.SplitN(rendered, "\n", 2)
	if len(lines) == 0 {
		return rendered
	}

	topLine := lines[0]
	// The top border starts with a corner char (e.g. "╭") followed by "─" chars.
	// We replace chars 1..1+titleWidth with the title.
	runes := []rune(topLine)
	titleRunes := []rune(title)

	if len(runes) < len(titleRunes)+2 {
		return rendered // too narrow for title
	}

	// Place title after the corner char
	copy(runes[1:], titleRunes)

	lines[0] = string(runes)
	return strings.Join(lines, "\n")
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
