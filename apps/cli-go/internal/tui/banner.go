package tui

import "fmt"

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

// RenderBanner produces the connection banner.
// width controls the separator length; pass 0 for default.
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
		sepLen = width - 4 // 2 chars indent each side
	}
	sep := make([]byte, sepLen)
	for i := range sep {
		sep[i] = '-'
	}
	// Use box-drawing char
	sepStr := ""
	for i := 0; i < sepLen; i++ {
		sepStr += "\u2500"
	}
	out += dimStyle.Render("  " + sepStr)
	out += "\n"
	return out
}
