package tui

import (
	"fmt"
	"time"
)

// RenderTrafficLine produces a formatted traffic log line matching the TS logger.
func RenderTrafficLine(method, path string, status int, duration time.Duration, ts time.Time) string {
	timeStr := dimStyle.Render(ts.Format("15:04:05"))
	truncPath := path
	if len(truncPath) > 30 {
		truncPath = truncPath[:30]
	}
	paddedPath := fmt.Sprintf("%-30s", truncPath)
	dur := dimStyle.Render(fmt.Sprintf("%5dms", duration.Milliseconds()))

	return fmt.Sprintf("  %s  %s  %s  %s  %s",
		timeStr,
		StyledMethod(method),
		paddedPath,
		StyledStatus(status),
		dur,
	)
}
