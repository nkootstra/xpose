package tui

import (
	"fmt"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

var (
	titleStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("2")) // green
	urlStyle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("6")) // cyan
	labelStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))            // gray
	ttlStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))            // yellow
	errorStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))            // red
	dimStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))            // gray

	statusStyles = map[string]lipgloss.Style{
		"connecting":   lipgloss.NewStyle().Foreground(lipgloss.Color("3")), // yellow
		"connected":    lipgloss.NewStyle().Foreground(lipgloss.Color("2")), // green
		"reconnecting": lipgloss.NewStyle().Foreground(lipgloss.Color("3")), // yellow
		"disconnected": lipgloss.NewStyle().Foreground(lipgloss.Color("1")), // red
		"expired":      lipgloss.NewStyle().Foreground(lipgloss.Color("1")), // red
	}

	methodStyles = map[string]lipgloss.Style{
		"GET":     lipgloss.NewStyle().Foreground(lipgloss.Color("6")), // cyan
		"HEAD":    lipgloss.NewStyle().Foreground(lipgloss.Color("6")), // cyan
		"POST":    lipgloss.NewStyle().Foreground(lipgloss.Color("2")), // green
		"PUT":     lipgloss.NewStyle().Foreground(lipgloss.Color("3")), // yellow
		"DELETE":  lipgloss.NewStyle().Foreground(lipgloss.Color("1")), // red
		"PATCH":   lipgloss.NewStyle().Foreground(lipgloss.Color("5")), // magenta
		"OPTIONS": lipgloss.NewStyle().Foreground(lipgloss.Color("8")), // gray
	}
)

// Panel border styles
func focusedBorderStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("4")) // blue
}

func blurredBorderStyle() lipgloss.Style {
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240")) // gray
}

// panelTitleStyle renders a panel title (placed in the border top line).
var panelTitleStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("4")).
	Bold(true)

// Hyperlink wraps displayText in an OSC 8 hyperlink escape sequence so
// terminals that support it render it as a clickable link.
func Hyperlink(url, displayText string) string {
	return ansi.SetHyperlink(url) + displayText + ansi.ResetHyperlink()
}

// StyledMethod returns a method string padded to 7 chars and colored.
func StyledMethod(method string) string {
	padded := fmt.Sprintf("%-7s", method)
	if style, ok := methodStyles[method]; ok {
		return style.Render(padded)
	}
	return padded
}

// StyledStatus returns a status code string colored by range.
func StyledStatus(status int) string {
	s := fmt.Sprintf("%d", status)
	if status >= 500 {
		return errorStyle.Render(s)
	}
	if status >= 400 {
		return ttlStyle.Render(s)
	}
	if status >= 300 {
		return lipgloss.NewStyle().Foreground(lipgloss.Color("6")).Render(s) // cyan
	}
	if status >= 200 {
		return lipgloss.NewStyle().Foreground(lipgloss.Color("2")).Render(s) // green
	}
	return s
}

// StyledTunnelStatus returns a styled status label.
func StyledTunnelStatus(status string) string {
	labels := map[string]string{
		"connecting":   "Connecting...",
		"connected":    "Connected",
		"reconnecting": "Reconnecting...",
		"disconnected": "Disconnected",
		"expired":      "Tunnel expired",
	}
	label, ok := labels[status]
	if !ok {
		label = status
	}
	if style, ok := statusStyles[status]; ok {
		return style.Render(label)
	}
	return label
}
