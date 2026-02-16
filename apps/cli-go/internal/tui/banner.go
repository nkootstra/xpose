package tui

import (
	"fmt"
	"strings"

	"charm.land/lipgloss/v2"
)

// FormatTTL formats a TTL in seconds as "Xh Ym Zs".
func FormatTTL(seconds int) string {
	if seconds < 0 {
		seconds = 0
	}
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	return fmt.Sprintf("%dh %dm %ds", h, m, s)
}

// RenderTunnelCard produces a compact tunnel info card for the left panel.
// Each connected tunnel looks like:
//
//	✓ Connected to Cloudflare's edge network
//	→ https://abc123.xpose.dev
//	  Forwarding to http://localhost:3000
//	  TTL: 3h 57m 12s
func RenderTunnelCard(url string, port int, ttlRemaining int, status string, lastError string, spinnerView string) string {
	var b strings.Builder

	switch status {
	case "connected":
		checkmark := lipgloss.NewStyle().Foreground(lipgloss.Color("2")).Render("✓")
		b.WriteString(fmt.Sprintf(" %s %s\n", checkmark, statusStyles["connected"].Render("Connected to Cloudflare's edge network")))

		arrow := lipgloss.NewStyle().Foreground(lipgloss.Color("6")).Render("→")
		// Apply the hyperlink to the plain URL, then style the whole thing.
		// This ensures the OSC 8 params aren't contaminated by ANSI color codes.
		linkedURL := urlStyle.Render(Hyperlink(url, url))
		b.WriteString(fmt.Sprintf(" %s %s\n", arrow, linkedURL))

		b.WriteString(fmt.Sprintf("   Forwarding to %s\n",
			dimStyle.Render(fmt.Sprintf("http://localhost:%d", port)),
		))
		b.WriteString(fmt.Sprintf("   TTL: %s\n", ttlStyle.Render(FormatTTL(ttlRemaining))))

	case "connecting":
		b.WriteString(fmt.Sprintf(" %s %s\n", spinnerView, statusStyles["connecting"].Render("Connecting...")))
		b.WriteString(fmt.Sprintf("   Port %d\n", port))

	case "reconnecting":
		b.WriteString(fmt.Sprintf(" %s %s\n", spinnerView, statusStyles["reconnecting"].Render("Reconnecting...")))
		b.WriteString(fmt.Sprintf("   Port %d\n", port))

	case "disconnected":
		cross := lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render("✗")
		b.WriteString(fmt.Sprintf(" %s %s\n", cross, statusStyles["disconnected"].Render("Disconnected")))
		b.WriteString(fmt.Sprintf("   Port %d\n", port))

	case "expired":
		cross := lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render("✗")
		b.WriteString(fmt.Sprintf(" %s %s\n", cross, statusStyles["expired"].Render("Tunnel expired")))
		b.WriteString(fmt.Sprintf("   Port %d\n", port))
	}

	if lastError != "" && status != "connected" {
		b.WriteString(fmt.Sprintf("   %s %s\n",
			errorStyle.Render("Error:"),
			lastError,
		))
	}

	return b.String()
}

// RenderCompactView produces the narrow-terminal view for all tunnels.
// Matches the minimal mockup style with no traffic panel.
func RenderCompactView(tunnels []tunnelViewData, spinnerView string) string {
	var b strings.Builder

	for i, t := range tunnels {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString(RenderTunnelCard(t.url, t.port, t.ttlRemaining, t.status, t.lastError, spinnerView))
	}

	return b.String()
}

// tunnelViewData is passed from the model to the rendering functions.
type tunnelViewData struct {
	port         int
	status       string
	url          string
	ttlRemaining int
	lastError    string
}

// RenderBanner produces the legacy connection banner (kept for test compatibility).
func RenderBanner(url string, port int, ttlRemaining int, maxBodySizeBytes int, width int) string {
	out := "\n"
	out += fmt.Sprintf("  %s\n", titleStyle.Render("xpose"))
	out += "\n"
	out += fmt.Sprintf("  %s    %s %s %s\n",
		labelStyle.Render("Forwarding"),
		urlStyle.Render(url),
		labelStyle.Render("->"),
		fmt.Sprintf("localhost:%d", port),
	)
	out += fmt.Sprintf("  %s           %s remaining\n",
		labelStyle.Render("TTL"),
		ttlStyle.Render(FormatTTL(ttlRemaining)),
	)
	out += fmt.Sprintf("  %s        %s\n",
		labelStyle.Render("Status"),
		StyledTunnelStatus("connected"),
	)
	if maxBodySizeBytes > 0 {
		out += fmt.Sprintf("  %s      %d bytes\n",
			labelStyle.Render("Max body"),
			maxBodySizeBytes,
		)
	}
	out += "\n"

	sepLen := 57
	if width > 4 {
		sepLen = width - 4
	}
	sepStr := ""
	for i := 0; i < sepLen; i++ {
		sepStr += "\u2500"
	}
	out += dimStyle.Render("  " + sepStr)
	out += "\n"
	return out
}
