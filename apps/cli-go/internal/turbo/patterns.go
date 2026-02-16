package turbo

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var (
	portEnvPattern          = regexp.MustCompile(`(?:^|\s)PORT=(\d{2,5})(?:\s|$)`)
	portFlagPattern         = regexp.MustCompile(`--port(?:=|\s+)(\d{2,5})(?:\s|$)`)
	shortPortSpacePattern   = regexp.MustCompile(`(?:^|\s)-p\s+(\d{2,5})(?:\s|$)`)
	shortPortNoSpacePattern = regexp.MustCompile(`(?:^|\s)-p(\d{2,5})(?:\s|$)`)
	listenPattern           = regexp.MustCompile(`--listen(?:=|\s+)(?:[^\s:]+:)?(\d{2,5})(?:\s|$)`)
	urlPattern              = regexp.MustCompile(`https?://[^\s/:]+:(\d{2,5})(?:[/\s]|$)`)
)

var portPatterns = []*regexp.Regexp{
	portEnvPattern,
	portFlagPattern,
	shortPortSpacePattern,
	shortPortNoSpacePattern,
	listenPattern,
	urlPattern,
}

var frameworkDefaults = []struct {
	pattern *regexp.Regexp
	port    int
}{
	{regexp.MustCompile(`\bwrangler\s+dev\b`), 8787},
	{regexp.MustCompile(`\bnext\s+dev\b`), 3000},
	{regexp.MustCompile(`\bnuxt\s+dev\b`), 3000},
	{regexp.MustCompile(`\bremix\s+dev\b`), 3000},
	{regexp.MustCompile(`\bastro\s+dev\b`), 4321},
	{regexp.MustCompile(`\bstart-storybook\b`), 6006},
	{regexp.MustCompile(`\bstorybook\b.*\bdev\b`), 6006},
}

var vitePattern = regexp.MustCompile(`\bvite\b`)
var vitestPattern = regexp.MustCompile(`\bvitest\b`)

func isValidPort(value int) bool {
	return value >= 1 && value <= 65535
}

func extractExplicitPorts(command string) []int {
	seen := make(map[int]struct{})
	var ports []int

	for _, pattern := range portPatterns {
		matches := pattern.FindAllStringSubmatch(command, -1)
		for _, match := range matches {
			if len(match) < 2 {
				continue
			}
			port, err := strconv.Atoi(match[1])
			if err != nil {
				continue
			}
			if !isValidPort(port) {
				continue
			}
			if _, exists := seen[port]; !exists {
				seen[port] = struct{}{}
				ports = append(ports, port)
			}
		}
	}

	sort.Ints(ports)
	return ports
}

func inferDefaultPort(command string) *int {
	cmd := strings.TrimSpace(command)

	for _, fw := range frameworkDefaults {
		if fw.pattern.MatchString(cmd) {
			port := fw.port
			return &port
		}
	}

	if vitePattern.MatchString(cmd) && !vitestPattern.MatchString(cmd) {
		port := 5173
		return &port
	}

	return nil
}
