package turbo

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"
)

// CommandRunner abstracts command execution so it can be mocked in tests.
type CommandRunner interface {
	Run(ctx context.Context, name string, args []string, cwd string) (string, error)
}

// ExecCommandRunner is the default implementation using os/exec.
type ExecCommandRunner struct{}

func (r *ExecCommandRunner) Run(ctx context.Context, name string, args []string, cwd string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	if cwd != "" {
		cmd.Dir = cwd
	}
	output, err := cmd.CombinedOutput()
	return string(output), err
}

// DiscoverOptions configures the turbo port discovery.
type DiscoverOptions struct {
	Cwd    string
	Task   string
	Filter string
}

// DiscoveredPort represents a port found from a turbo task command.
type DiscoveredPort struct {
	Port        int
	PackageName string
	Directory   string
	Command     string
	Reason      string // "explicit" or "default"
}

type turboDryRunTask struct {
	Command   string `json:"command"`
	Package   string `json:"package"`
	Directory string `json:"directory"`
}

type turboDryRunResponse struct {
	Tasks []turboDryRunTask `json:"tasks"`
}

// DiscoverTurboPorts runs turbo in dry-run mode and extracts port information
// from the task commands.
func DiscoverTurboPorts(ctx context.Context, opts DiscoverOptions, runner CommandRunner) ([]DiscoveredPort, error) {
	if runner == nil {
		runner = &ExecCommandRunner{}
	}

	args := []string{"run", opts.Task, "--dry=json"}
	if opts.Filter != "" {
		args = append(args, "--filter="+opts.Filter)
	}

	output, err := runner.Run(ctx, "turbo", args, opts.Cwd)
	if err != nil {
		return nil, fmt.Errorf("failed to run turbo dry-run: %w", err)
	}

	jsonStr, err := extractJSON(output)
	if err != nil {
		return nil, fmt.Errorf("failed to extract JSON from turbo output: %w", err)
	}

	var response turboDryRunResponse
	if err := json.Unmarshal([]byte(jsonStr), &response); err != nil {
		return nil, fmt.Errorf("failed to parse turbo dry-run JSON: %w", err)
	}

	seen := make(map[int]struct{})
	var results []DiscoveredPort

	for _, task := range response.Tasks {
		cmd := strings.TrimSpace(task.Command)
		if cmd == "" {
			continue
		}

		explicitPorts := extractExplicitPorts(cmd)
		if len(explicitPorts) > 0 {
			for _, port := range explicitPorts {
				if _, exists := seen[port]; !exists {
					seen[port] = struct{}{}
					results = append(results, DiscoveredPort{
						Port:        port,
						PackageName: task.Package,
						Directory:   task.Directory,
						Command:     cmd,
						Reason:      "explicit",
					})
				}
			}
			continue
		}

		if defaultPort := inferDefaultPort(cmd); defaultPort != nil {
			if _, exists := seen[*defaultPort]; !exists {
				seen[*defaultPort] = struct{}{}
				results = append(results, DiscoveredPort{
					Port:        *defaultPort,
					PackageName: task.Package,
					Directory:   task.Directory,
					Command:     cmd,
					Reason:      "default",
				})
			}
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Port < results[j].Port
	})

	return results, nil
}

func extractJSON(output string) (string, error) {
	first := strings.Index(output, "{")
	last := strings.LastIndex(output, "}")
	if first == -1 || last == -1 || last < first {
		return "", fmt.Errorf("no valid JSON object found in output")
	}
	return output[first : last+1], nil
}
