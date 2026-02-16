package protocol

import (
	"encoding/json"
)

// Envelope is used for initial type discrimination when parsing messages.
type Envelope struct {
	Type string `json:"type"`
}

// AuthMessage is sent by the client to authenticate a tunnel session.
type AuthMessage struct {
	Type      string `json:"type"`
	Subdomain string `json:"subdomain"`
	TTL       int    `json:"ttl,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
}

// AuthAckMessage is sent by the server to acknowledge a successful authentication.
type AuthAckMessage struct {
	Type             string `json:"type"`
	Subdomain        string `json:"subdomain"`
	URL              string `json:"url"`
	TTL              int    `json:"ttl"`
	RemainingTTL     int    `json:"remainingTtl"`
	SessionID        string `json:"sessionId"`
	MaxBodySizeBytes int    `json:"maxBodySizeBytes"`
}

// HttpRequestMessage represents an incoming HTTP request forwarded through the tunnel.
type HttpRequestMessage struct {
	Type    string            `json:"type"`
	ID      string            `json:"id"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Headers map[string]string `json:"headers"`
	HasBody bool              `json:"hasBody"`
}

// HttpResponseMetaMessage contains the response metadata sent back through the tunnel.
type HttpResponseMetaMessage struct {
	Type    string            `json:"type"`
	ID      string            `json:"id"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	HasBody bool              `json:"hasBody"`
}

// HttpBodyChunkMessage signals a body chunk transfer for a given request.
type HttpBodyChunkMessage struct {
	Type string `json:"type"`
	ID   string `json:"id"`
	Done bool   `json:"done"`
}

// HttpRequestEndMessage signals the end of an HTTP request body.
type HttpRequestEndMessage struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// HttpResponseEndMessage signals the end of an HTTP response body.
type HttpResponseEndMessage struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// PingMsg is a keep-alive ping message.
type PingMsg struct {
	Type string `json:"type"`
}

// PongMsg is a keep-alive pong response message.
type PongMsg struct {
	Type string `json:"type"`
}

// ErrorMessage is sent by the server to indicate an error.
type ErrorMessage struct {
	Type      string `json:"type"`
	Message   string `json:"message"`
	RequestID string `json:"requestId,omitempty"`
	Status    int    `json:"status,omitempty"`
}

// ---- WebSocket relay messages ----

// WsUpgradeMessage is sent by the server to ask the CLI to open a local WS connection.
type WsUpgradeMessage struct {
	Type     string            `json:"type"`
	StreamID string            `json:"streamId"`
	Path     string            `json:"path"`
	Headers  map[string]string `json:"headers"`
}

// WsUpgradeAckMessage is sent by the CLI to confirm or reject a WS upgrade.
type WsUpgradeAckMessage struct {
	Type     string `json:"type"`
	StreamID string `json:"streamId"`
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`
}

// WsFrameMessage signals a WebSocket frame relay. The actual payload follows
// as a binary frame using the standard binary encoding (streamId prefix + body).
type WsFrameMessage struct {
	Type      string `json:"type"`
	StreamID  string `json:"streamId"`
	FrameType string `json:"frameType"` // "text" or "binary"
}

// WsCloseMessage signals that one side of a relayed WebSocket has closed.
type WsCloseMessage struct {
	Type     string `json:"type"`
	StreamID string `json:"streamId"`
	Code     int    `json:"code"`
	Reason   string `json:"reason"`
}

// ParseTextMessage parses a raw JSON message into its concrete message struct.
// It returns (nil, nil) for unknown message types.
// It returns (nil, error) for malformed JSON.
func ParseTextMessage(raw []byte) (any, error) {
	var env Envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, err
	}

	switch env.Type {
	case "auth":
		var msg AuthMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "auth-ack":
		var msg AuthAckMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "http-request":
		var msg HttpRequestMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "http-response-meta":
		var msg HttpResponseMetaMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "http-body-chunk":
		var msg HttpBodyChunkMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "http-request-end":
		var msg HttpRequestEndMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "http-response-end":
		var msg HttpResponseEndMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "ping":
		var msg PingMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "pong":
		var msg PongMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "error":
		var msg ErrorMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "ws-upgrade":
		var msg WsUpgradeMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "ws-upgrade-ack":
		var msg WsUpgradeAckMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "ws-frame":
		var msg WsFrameMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case "ws-close":
		var msg WsCloseMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	default:
		return nil, nil
	}
}

// IsTunnelMessage checks whether the given data looks like a tunnel protocol
// message by verifying it contains a "type" field.
func IsTunnelMessage(data []byte) bool {
	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return false
	}
	return env.Type != ""
}
