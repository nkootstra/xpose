package tui

import (
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/nkootstra/xpose/internal/tunnel"
)

// tunnelEventMsg wraps a tunnel event with its tunnel index.
type tunnelEventMsg struct {
	tunnelIndex int
	event       tunnel.TunnelEvent
}

// tickMsg fires every second to update the TTL countdown.
type tickMsg time.Time

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

// tickEvery returns a command that sends a tickMsg every second.
func tickEvery() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}
