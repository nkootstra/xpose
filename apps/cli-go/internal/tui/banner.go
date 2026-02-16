package tui

import "fmt"

// FormatTTL formats a TTL in seconds as "Xh Ym Zs".
func FormatTTL(seconds int) string {
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	return fmt.Sprintf("%dh %dm %ds", h, m, s)
}

// RenderBanner produces the connection banner matching the TS logger output.
func RenderBanner(url string, port int, ttl int, maxBodySizeBytes int) string {
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
		ttlStyle.Render(FormatTTL(ttl)),
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
	out += dimStyle.Render("  ─────────────────────────────────────────────────────────")
	out += "\n"
	return out
}
