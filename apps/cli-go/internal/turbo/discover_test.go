package turbo

import (
	"context"
	"errors"
	"testing"
)

type mockRunner struct {
	output string
	err    error
}

func (m *mockRunner) Run(_ context.Context, _ string, _ []string, _ string) (string, error) {
	return m.output, m.err
}

func TestDiscoverTurboPorts_MultiplePackages(t *testing.T) {
	runner := &mockRunner{
		output: `{
			"tasks": [
				{"command": "next dev --port 3000", "package": "@myapp/web", "directory": "apps/web"},
				{"command": "vite --port 5173", "package": "@myapp/docs", "directory": "apps/docs"},
				{"command": "wrangler dev --port 8787", "package": "@myapp/api", "directory": "apps/api"}
			]
		}`,
	}

	results, err := DiscoverTurboPorts(context.Background(), DiscoverOptions{Task: "dev"}, runner)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}

	expectedPorts := []int{3000, 5173, 8787}
	for i, want := range expectedPorts {
		if results[i].Port != want {
			t.Errorf("results[%d].Port = %d, want %d", i, results[i].Port, want)
		}
		if results[i].Reason != "explicit" {
			t.Errorf("results[%d].Reason = %q, want %q", i, results[i].Reason, "explicit")
		}
	}
	if results[0].PackageName != "@myapp/web" {
		t.Errorf("results[0].PackageName = %q, want %q", results[0].PackageName, "@myapp/web")
	}
}

func TestDiscoverTurboPorts_EmptyTasks(t *testing.T) {
	runner := &mockRunner{output: `{"tasks": []}`}
	results, err := DiscoverTurboPorts(context.Background(), DiscoverOptions{Task: "dev"}, runner)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestDiscoverTurboPorts_MixedExplicitAndDefault(t *testing.T) {
	runner := &mockRunner{
		output: `{
			"tasks": [
				{"command": "next dev --port 4000", "package": "@myapp/web", "directory": "apps/web"},
				{"command": "astro dev", "package": "@myapp/docs", "directory": "apps/docs"}
			]
		}`,
	}

	results, err := DiscoverTurboPorts(context.Background(), DiscoverOptions{Task: "dev"}, runner)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	if results[0].Port != 4000 || results[0].Reason != "explicit" {
		t.Errorf("results[0]: port=%d reason=%q, want port=4000 reason=explicit", results[0].Port, results[0].Reason)
	}
	if results[1].Port != 4321 || results[1].Reason != "default" {
		t.Errorf("results[1]: port=%d reason=%q, want port=4321 reason=default", results[1].Port, results[1].Reason)
	}
}

func TestDiscoverTurboPorts_Deduplication(t *testing.T) {
	runner := &mockRunner{
		output: `{
			"tasks": [
				{"command": "next dev --port 3000", "package": "@myapp/web", "directory": "apps/web"},
				{"command": "remix dev --port 3000", "package": "@myapp/api", "directory": "apps/api"}
			]
		}`,
	}

	results, err := DiscoverTurboPorts(context.Background(), DiscoverOptions{Task: "dev"}, runner)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result (deduplicated), got %d", len(results))
	}
	if results[0].PackageName != "@myapp/web" {
		t.Errorf("results[0].PackageName = %q, want %q (first wins)", results[0].PackageName, "@myapp/web")
	}
}

func TestDiscoverTurboPorts_CommandError(t *testing.T) {
	runner := &mockRunner{output: "turbo: command not found", err: errors.New("exit status 127")}
	_, err := DiscoverTurboPorts(context.Background(), DiscoverOptions{Task: "dev"}, runner)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestDiscoverTurboPorts_InvalidJSON(t *testing.T) {
	runner := &mockRunner{output: "this is not json at all"}
	_, err := DiscoverTurboPorts(context.Background(), DiscoverOptions{Task: "dev"}, runner)
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestDiscoverTurboPorts_JSONWithSurroundingOutput(t *testing.T) {
	runner := &mockRunner{
		output: "some turbo warning\n" +
			`{"tasks": [{"command": "next dev", "package": "@myapp/web", "directory": "apps/web"}]}` +
			"\ntrailing output",
	}

	results, err := DiscoverTurboPorts(context.Background(), DiscoverOptions{Task: "dev"}, runner)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Port != 3000 || results[0].Reason != "default" {
		t.Errorf("results[0]: port=%d reason=%q, want port=3000 reason=default", results[0].Port, results[0].Reason)
	}
}

func TestDiscoverTurboPorts_EmptyCommand(t *testing.T) {
	runner := &mockRunner{
		output: `{"tasks": [{"command": "", "package": "@myapp/web", "directory": "apps/web"}, {"command": "   ", "package": "@myapp/api", "directory": "apps/api"}]}`,
	}
	results, err := DiscoverTurboPorts(context.Background(), DiscoverOptions{Task: "dev"}, runner)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results for empty commands, got %d", len(results))
	}
}

func TestDiscoverTurboPorts_WithFilter(t *testing.T) {
	var capturedArgs []string
	runner := &capturingRunner{
		output: `{"tasks": []}`,
		onRun: func(_ context.Context, _ string, args []string, _ string) {
			capturedArgs = args
		},
	}

	_, err := DiscoverTurboPorts(context.Background(), DiscoverOptions{Task: "dev", Filter: "@myapp/web"}, runner)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	found := false
	for _, arg := range capturedArgs {
		if arg == "--filter=@myapp/web" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected --filter=@myapp/web in args %v", capturedArgs)
	}
}

func TestExtractJSON(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"clean JSON", `{"tasks": []}`, `{"tasks": []}`, false},
		{"JSON with surrounding text", "warning\n{\"tasks\": []}\ntrailing", `{"tasks": []}`, false},
		{"no JSON", "no json here", "", true},
		{"empty string", "", "", true},
		{"only opening brace", "{", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := extractJSON(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("extractJSON(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("extractJSON(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

type capturingRunner struct {
	output string
	err    error
	onRun  func(ctx context.Context, name string, args []string, cwd string)
}

func (r *capturingRunner) Run(ctx context.Context, name string, args []string, cwd string) (string, error) {
	if r.onRun != nil {
		r.onRun(ctx, name, args, cwd)
	}
	return r.output, r.err
}
