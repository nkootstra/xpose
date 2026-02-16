package protocol

import (
	"testing"
)

func TestParseTextMessage(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantType string
		wantNil  bool
		wantErr  bool
	}{
		{
			name:     "valid auth message",
			input:    `{"type":"auth","subdomain":"abc123def456","ttl":3600,"sessionId":"sess-001"}`,
			wantType: "auth",
		},
		{
			name:     "valid auth message without optional fields",
			input:    `{"type":"auth","subdomain":"abc123def456"}`,
			wantType: "auth",
		},
		{
			name:     "valid auth-ack message",
			input:    `{"type":"auth-ack","subdomain":"abc123def456","url":"https://abc123def456.example.com","ttl":3600,"sessionId":"sess-001","maxBodySizeBytes":5242880}`,
			wantType: "auth-ack",
		},
		{
			name:     "valid http-request message",
			input:    `{"type":"http-request","id":"req123456789","method":"GET","path":"/api/test","headers":{"content-type":"application/json"},"hasBody":false}`,
			wantType: "http-request",
		},
		{
			name:     "valid http-response-meta message",
			input:    `{"type":"http-response-meta","id":"req123456789","status":200,"headers":{"content-type":"text/plain"},"hasBody":true}`,
			wantType: "http-response-meta",
		},
		{
			name:     "valid http-body-chunk message",
			input:    `{"type":"http-body-chunk","id":"req123456789","done":false}`,
			wantType: "http-body-chunk",
		},
		{
			name:     "valid http-request-end message",
			input:    `{"type":"http-request-end","id":"req123456789"}`,
			wantType: "http-request-end",
		},
		{
			name:     "valid http-response-end message",
			input:    `{"type":"http-response-end","id":"req123456789"}`,
			wantType: "http-response-end",
		},
		{
			name:     "valid error message with optional fields",
			input:    `{"type":"error","message":"not found","requestId":"req123456789","status":404}`,
			wantType: "error",
		},
		{
			name:     "valid error message without optional fields",
			input:    `{"type":"error","message":"internal error"}`,
			wantType: "error",
		},
		{
			name:     "valid ping message",
			input:    `{"type":"ping"}`,
			wantType: "ping",
		},
		{
			name:     "valid pong message",
			input:    `{"type":"pong"}`,
			wantType: "pong",
		},
		{
			name:    "invalid JSON returns error",
			input:   `{not valid json`,
			wantErr: true,
		},
		{
			name:    "unknown type returns nil",
			input:   `{"type":"unknown-type"}`,
			wantNil: true,
		},
		{
			name:    "non-JSON string returns error",
			input:   `hello world`,
			wantErr: true,
		},
		{
			name:    "empty type returns nil",
			input:   `{"type":""}`,
			wantNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg, err := ParseTextMessage([]byte(tt.input))

			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if tt.wantNil {
				if msg != nil {
					t.Fatalf("expected nil message, got %T", msg)
				}
				return
			}

			if msg == nil {
				t.Fatalf("expected non-nil message for type %q", tt.wantType)
			}

			switch tt.wantType {
			case "auth":
				m, ok := msg.(*AuthMessage)
				if !ok {
					t.Fatalf("expected *AuthMessage, got %T", msg)
				}
				if m.Type != "auth" {
					t.Errorf("expected type %q, got %q", "auth", m.Type)
				}
			case "auth-ack":
				m, ok := msg.(*AuthAckMessage)
				if !ok {
					t.Fatalf("expected *AuthAckMessage, got %T", msg)
				}
				if m.Type != "auth-ack" {
					t.Errorf("expected type %q, got %q", "auth-ack", m.Type)
				}
			case "http-request":
				m, ok := msg.(*HttpRequestMessage)
				if !ok {
					t.Fatalf("expected *HttpRequestMessage, got %T", msg)
				}
				if m.Method != "GET" {
					t.Errorf("expected method GET, got %q", m.Method)
				}
			case "http-response-meta":
				m, ok := msg.(*HttpResponseMetaMessage)
				if !ok {
					t.Fatalf("expected *HttpResponseMetaMessage, got %T", msg)
				}
				if m.Status != 200 {
					t.Errorf("expected status 200, got %d", m.Status)
				}
			case "http-body-chunk":
				m, ok := msg.(*HttpBodyChunkMessage)
				if !ok {
					t.Fatalf("expected *HttpBodyChunkMessage, got %T", msg)
				}
				if m.Done {
					t.Errorf("expected done=false")
				}
			case "http-request-end":
				_, ok := msg.(*HttpRequestEndMessage)
				if !ok {
					t.Fatalf("expected *HttpRequestEndMessage, got %T", msg)
				}
			case "http-response-end":
				_, ok := msg.(*HttpResponseEndMessage)
				if !ok {
					t.Fatalf("expected *HttpResponseEndMessage, got %T", msg)
				}
			case "error":
				m, ok := msg.(*ErrorMessage)
				if !ok {
					t.Fatalf("expected *ErrorMessage, got %T", msg)
				}
				if m.Message == "" {
					t.Errorf("expected non-empty error message")
				}
			case "ping":
				_, ok := msg.(*PingMsg)
				if !ok {
					t.Fatalf("expected *PingMsg, got %T", msg)
				}
			case "pong":
				_, ok := msg.(*PongMsg)
				if !ok {
					t.Fatalf("expected *PongMsg, got %T", msg)
				}
			}
		})
	}
}

func TestParseAuthMessageFields(t *testing.T) {
	raw := []byte(`{"type":"auth","subdomain":"mysubdomain1","ttl":7200,"sessionId":"sess-abc"}`)
	msg, err := ParseTextMessage(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	auth, ok := msg.(*AuthMessage)
	if !ok {
		t.Fatalf("expected *AuthMessage, got %T", msg)
	}
	if auth.Subdomain != "mysubdomain1" {
		t.Errorf("subdomain: got %q, want %q", auth.Subdomain, "mysubdomain1")
	}
	if auth.TTL != 7200 {
		t.Errorf("ttl: got %d, want %d", auth.TTL, 7200)
	}
	if auth.SessionID != "sess-abc" {
		t.Errorf("sessionId: got %q, want %q", auth.SessionID, "sess-abc")
	}
}

func TestParseErrorMessageOptionalFields(t *testing.T) {
	raw := []byte(`{"type":"error","message":"timeout","requestId":"req-xyz","status":408}`)
	msg, err := ParseTextMessage(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	errMsg, ok := msg.(*ErrorMessage)
	if !ok {
		t.Fatalf("expected *ErrorMessage, got %T", msg)
	}
	if errMsg.RequestID != "req-xyz" {
		t.Errorf("requestId: got %q, want %q", errMsg.RequestID, "req-xyz")
	}
	if errMsg.Status != 408 {
		t.Errorf("status: got %d, want %d", errMsg.Status, 408)
	}
}

func TestIsTunnelMessage(t *testing.T) {
	tests := []struct {
		name string
		data string
		want bool
	}{
		{"valid tunnel message", `{"type":"auth"}`, true},
		{"empty type", `{"type":""}`, false},
		{"no type field", `{"foo":"bar"}`, false},
		{"invalid JSON", `not json`, false},
		{"empty object", `{}`, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsTunnelMessage([]byte(tt.data))
			if got != tt.want {
				t.Errorf("IsTunnelMessage(%q) = %v, want %v", tt.data, got, tt.want)
			}
		})
	}
}
