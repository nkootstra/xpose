package cmd

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/spf13/cobra"

	"github.com/nkootstra/xpose/internal/protocol"
	"github.com/nkootstra/xpose/internal/session"
	"github.com/nkootstra/xpose/internal/tui"
	"github.com/nkootstra/xpose/internal/tunnel"
	"github.com/nkootstra/xpose/internal/turbo"
	"github.com/nkootstra/xpose/internal/version"
)

var (
	fromTurbo   bool
	turboTask   string
	turboFilter string
	turboPath   string
	ttlFlag     int
	subdomain   string
	domainFlag  string
	resumeFlag  bool
)

var rootCmd = &cobra.Command{
	Use:     "xpose [port...]",
	Short:   "Expose local servers to the internet via Cloudflare",
	Version: version.String(),
	Args:    cobra.ArbitraryArgs,
	RunE:    run,
}

func init() {
	rootCmd.Flags().BoolVar(&fromTurbo, "from-turbo", false, "Auto-detect ports from Turborepo dev tasks")
	rootCmd.Flags().StringVar(&turboTask, "turbo-task", "dev", "Turborepo task to inspect")
	rootCmd.Flags().StringVar(&turboFilter, "turbo-filter", "", "Optional Turborepo filter")
	rootCmd.Flags().StringVar(&turboPath, "turbo-path", "", "Path to Turborepo root")
	rootCmd.Flags().StringVar(&turboPath, "path", "", "Path to Turborepo root (alias)")
	rootCmd.Flags().IntVar(&ttlFlag, "ttl", protocol.DefaultTTLSeconds, "Tunnel TTL in seconds")
	rootCmd.Flags().StringVar(&subdomain, "subdomain", "", "Custom subdomain (default: random)")
	rootCmd.Flags().StringVar(&domainFlag, "domain", protocol.DefaultPublicDomain, "Public tunnel domain")
	rootCmd.Flags().BoolVarP(&resumeFlag, "resume", "r", false, "Resume the previous tunnel session")
}

func normalizeDomain(raw string) string {
	s := strings.TrimSpace(strings.ToLower(raw))
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	if idx := strings.IndexByte(s, '/'); idx >= 0 {
		s = s[:idx]
	}
	s = strings.TrimSuffix(s, ".")
	return s
}

func Execute() error {
	return rootCmd.Execute()
}

func run(cmd *cobra.Command, args []string) error {
	if ttlFlag < 1 {
		return fmt.Errorf("invalid TTL: must be a positive number of seconds")
	}

	// --- Resume mode ---
	if resumeFlag {
		if len(args) > 0 || fromTurbo {
			return fmt.Errorf("cannot use --resume with port arguments or --from-turbo")
		}

		prev, err := session.Load()
		if err != nil {
			return fmt.Errorf("failed to load session: %w", err)
		}
		if prev == nil {
			return fmt.Errorf("no session to resume (sessions expire after %d minutes)", protocol.SessionResumeWindowSeconds/60)
		}

		return runTunnels(cmd, prev.Tunnels)
	}

	// --- Normal mode: resolve ports ---
	ports := make(map[int]struct{})
	for _, arg := range args {
		port, err := strconv.Atoi(arg)
		if err != nil || port < 1 || port > 65535 {
			return fmt.Errorf("invalid port %q: ports must be between 1 and 65535", arg)
		}
		ports[port] = struct{}{}
	}

	// Turborepo port discovery
	if fromTurbo {
		task := strings.TrimSpace(turboTask)
		if task == "" {
			task = "dev"
		}

		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		turboCwd := cwd
		if turboPath != "" {
			turboCwd = filepath.Join(cwd, turboPath)
		}

		info, err := os.Stat(turboCwd)
		if err != nil || !info.IsDir() {
			return fmt.Errorf("invalid --path: directory does not exist: %s", turboCwd)
		}

		discovered, err := turbo.DiscoverTurboPorts(cmd.Context(), turbo.DiscoverOptions{
			Cwd:    turboCwd,
			Task:   task,
			Filter: turboFilter,
		}, nil)
		if err != nil {
			return fmt.Errorf("failed to inspect Turborepo: %w", err)
		}

		if len(discovered) == 0 {
			fmt.Fprintf(os.Stderr, "  Error: No ports detected from Turborepo task %q.\n", task)
		} else {
			entries := make([]string, len(discovered))
			for i, e := range discovered {
				entries[i] = fmt.Sprintf("%d [%s]", e.Port, e.PackageName)
			}
			fmt.Printf("  Discovered from Turborepo (%s): %s\n", task, strings.Join(entries, ", "))
		}

		for _, entry := range discovered {
			ports[entry.Port] = struct{}{}
		}
	}

	if len(ports) == 0 {
		return fmt.Errorf("no ports provided. Pass ports directly (e.g. `xpose 3000 8787`) or use --from-turbo")
	}

	// Deduplicate
	resolvedPorts := make([]int, 0, len(ports))
	for p := range ports {
		resolvedPorts = append(resolvedPorts, p)
	}

	baseSubdomain := strings.TrimSpace(subdomain)
	tunnelDomain := normalizeDomain(domainFlag)
	if tunnelDomain == "" {
		return fmt.Errorf("invalid --domain: pass a hostname like xpose.dev")
	}

	// Build tunnel entries with generated subdomains
	entries := make([]session.TunnelEntry, len(resolvedPorts))
	for i, port := range resolvedPorts {
		var sub string
		if baseSubdomain != "" {
			if len(resolvedPorts) == 1 {
				sub = protocol.BuildCustomSubdomain(baseSubdomain)
			} else {
				sub = protocol.BuildCustomSubdomain(fmt.Sprintf("%s-%d", baseSubdomain, port))
			}
		} else {
			sub = protocol.GenerateSubdomainID()
		}
		entries[i] = session.TunnelEntry{
			Subdomain: sub,
			Port:      port,
			Domain:    tunnelDomain,
		}
	}

	return runTunnels(cmd, entries)
}

// runTunnels creates tunnel clients from entries, saves the session, runs the
// TUI, and prints the resume hint after exit.
func runTunnels(_ *cobra.Command, entries []session.TunnelEntry) error {
	tunnelTTL := int(math.Min(float64(ttlFlag), float64(protocol.MaxTTLSeconds)))

	clients := make([]*tunnel.Client, len(entries))
	ports := make([]int, len(entries))
	for i, e := range entries {
		ports[i] = e.Port
		clients[i] = tunnel.NewClient(tunnel.ClientOptions{
			Subdomain: e.Subdomain,
			Port:      e.Port,
			TTL:       tunnelTTL,
			Host:      "localhost",
			Domain:    e.Domain,
		})
	}

	// Save session so it can be resumed after exit.
	sess := &session.Session{
		Tunnels:   entries,
		CreatedAt: time.Now(),
	}
	if err := session.Save(sess); err != nil {
		fmt.Fprintf(os.Stderr, "  Warning: failed to save session: %v\n", err)
	}

	// Start all tunnel connections
	for _, c := range clients {
		c.Connect()
	}

	// Run the TUI
	model := tui.NewModel(clients, ports)
	p := tea.NewProgram(model)
	if _, err := p.Run(); err != nil {
		return fmt.Errorf("TUI error: %w", err)
	}

	// Update session timestamp so the resume window starts from exit time.
	sess.CreatedAt = time.Now()
	if err := session.Save(sess); err != nil {
		fmt.Fprintf(os.Stderr, "  Warning: failed to save session: %v\n", err)
	}

	// Print resume hint after the alt screen exits (persists in terminal).
	minutes := protocol.SessionResumeWindowSeconds / 60
	fmt.Fprintf(os.Stderr, "\n  Session saved. Resume within %d minutes with: xpose -r\n\n", minutes)

	return nil
}
