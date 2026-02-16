package tui

import (
	tea "charm.land/bubbletea/v2"
	"github.com/xpose-dev/xpose/internal/tunnel"
)

// tunnelEventMsg wraps a tunnel event with its tunnel index.
type tunnelEventMsg struct {
	tunnelIndex int
	event       tunnel.TunnelEvent
}

// listenForEvents returns a command that blocks on a tunnel client's event channel
// and sends events to the Bubble Tea runtime.
func listenForEvents(client *tunnel.Client, index int) tea.Cmd {
	return func() tea.Msg {
		ev, ok := <-client.Events
		if !ok {
			return nil
		}
		return tunnelEventMsg{tunnelIndex: index, event: ev}
	}
}
