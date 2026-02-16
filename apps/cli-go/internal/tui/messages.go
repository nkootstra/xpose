package tui

import (
	"os/exec"
	"runtime"
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

// openBrowserMsg is sent after attempting to open a URL in the browser.
type openBrowserMsg struct {
	err error
}

// openBrowser returns a command that opens the given URL in the default browser.
func openBrowser(url string) tea.Cmd {
	return func() tea.Msg {
		var cmd *exec.Cmd
		switch runtime.GOOS {
		case "darwin":
			cmd = exec.Command("open", url)
		case "windows":
			cmd = exec.Command("cmd", "/c", "start", url)
		default: // linux, freebsd, etc.
			cmd = exec.Command("xdg-open", url)
		}
		return openBrowserMsg{err: cmd.Start()}
	}
}
