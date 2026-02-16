package tunnel

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/nkootstra/xpose/internal/protocol"
)

// TunnelStatus represents the connection state of a tunnel.
type TunnelStatus string

const (
	StatusConnecting   TunnelStatus = "connecting"
	StatusConnected    TunnelStatus = "connected"
	StatusReconnecting TunnelStatus = "reconnecting"
	StatusDisconnected TunnelStatus = "disconnected"
	StatusExpired      TunnelStatus = "expired"
)

// TrafficEntry records a single proxied HTTP request.
type TrafficEntry struct {
	ID        string
	Method    string
	Path      string
	Status    int
	Duration  time.Duration
	Timestamp time.Time
}

// AuthenticatedInfo is emitted after a successful auth-ack.
type AuthenticatedInfo struct {
	URL              string
	TTL              int
	SessionID        string
	MaxBodySizeBytes int
}

// TunnelEvent is an event emitted by the tunnel client.
type TunnelEvent struct {
	Type          string
	Status        TunnelStatus
	Authenticated *AuthenticatedInfo
	Traffic       *TrafficEntry
	Error         error
}

// ClientOptions configures a tunnel client.
type ClientOptions struct {
	Subdomain string
	Port      int
	TTL       int
	Host      string
	Domain    string
}

// Client manages a WebSocket tunnel connection.
type Client struct {
	opts   ClientOptions
	Events chan TunnelEvent
	wsURL  string

	mu                     sync.Mutex
	conn                   *websocket.Conn
	sessionID              string
	maxBodySizeBytes       int
	reconnectAttempts      int
	disconnectedIntionally bool
	requestBodyChunks      map[string][][]byte
	requestBodySizes       map[string]int
	oversizedRequestIDs    map[string]struct{}
	pendingRequestMeta     map[string]*protocol.HttpRequestMessage
	cancelFunc             context.CancelFunc
}

// NewClient creates a new tunnel client.
func NewClient(opts ClientOptions) *Client {
	domain := opts.Domain
	if domain == "" {
		domain = protocol.DefaultPublicDomain
	}

	return &Client{
		opts:                opts,
		Events:              make(chan TunnelEvent, 100),
		wsURL:               fmt.Sprintf("wss://%s.%s%s", opts.Subdomain, domain, protocol.TunnelConnectPath),
		maxBodySizeBytes:    protocol.DefaultMaxBodySizeBytes,
		requestBodyChunks:   make(map[string][][]byte),
		requestBodySizes:    make(map[string]int),
		oversizedRequestIDs: make(map[string]struct{}),
		pendingRequestMeta:  make(map[string]*protocol.HttpRequestMessage),
	}
}

// Connect starts the WebSocket connection. Non-blocking.
func (c *Client) Connect() {
	go c.connectLoop()
}

// Disconnect gracefully shuts down the client.
func (c *Client) Disconnect() {
	c.mu.Lock()
	c.disconnectedIntionally = true
	conn := c.conn
	cancel := c.cancelFunc
	c.mu.Unlock()

	if conn != nil {
		conn.Close(websocket.StatusNormalClosure, "Client disconnect")
	}
	if cancel != nil {
		cancel()
	}

	c.emit(TunnelEvent{Type: "status", Status: StatusDisconnected})
}

func (c *Client) emit(ev TunnelEvent) {
	select {
	case c.Events <- ev:
	default:
		// Drop event if channel is full to prevent deadlocks
	}
}

func (c *Client) connectLoop() {
	c.mu.Lock()
	status := StatusConnecting
	if c.reconnectAttempts > 0 {
		status = StatusReconnecting
	}
	c.disconnectedIntionally = false
	c.mu.Unlock()

	c.emit(TunnelEvent{Type: "status", Status: status})

	ctx, cancel := context.WithCancel(context.Background())
	c.mu.Lock()
	c.cancelFunc = cancel
	c.mu.Unlock()
	defer cancel()

	conn, _, err := websocket.Dial(ctx, c.wsURL, nil)
	if err != nil {
		c.mu.Lock()
		intentional := c.disconnectedIntionally
		c.mu.Unlock()

		if !intentional {
			c.emit(TunnelEvent{Type: "error", Error: fmt.Errorf("dial failed: %w", err)})
			c.scheduleReconnect()
		}
		return
	}

	// Set a large read limit for binary frames
	conn.SetReadLimit(int64(c.maxBodySizeBytes) + int64(protocol.RequestIDLength) + 1024)

	c.mu.Lock()
	c.conn = conn
	c.reconnectAttempts = 0
	c.mu.Unlock()

	// Send auth message
	c.mu.Lock()
	authMsg := protocol.AuthMessage{
		Type:      "auth",
		Subdomain: c.opts.Subdomain,
		TTL:       c.opts.TTL,
		SessionID: c.sessionID,
	}
	c.mu.Unlock()

	authData, _ := json.Marshal(authMsg)
	if err := conn.Write(ctx, websocket.MessageText, authData); err != nil {
		c.emit(TunnelEvent{Type: "error", Error: fmt.Errorf("failed to send auth: %w", err)})
		conn.Close(websocket.StatusInternalError, "auth failed")
		c.scheduleReconnect()
		return
	}

	// Read loop
	for {
		msgType, data, err := conn.Read(ctx)
		if err != nil {
			c.mu.Lock()
			intentional := c.disconnectedIntionally
			c.mu.Unlock()

			if !intentional {
				c.scheduleReconnect()
			}
			return
		}

		switch msgType {
		case websocket.MessageText:
			c.handleTextMessage(ctx, conn, data)
		case websocket.MessageBinary:
			c.handleBinaryFrame(data)
		}
	}
}

func (c *Client) handleTextMessage(ctx context.Context, conn *websocket.Conn, data []byte) {
	parsed, err := protocol.ParseTextMessage(data)
	if err != nil || parsed == nil {
		return
	}

	switch msg := parsed.(type) {
	case *protocol.AuthAckMessage:
		c.mu.Lock()
		c.sessionID = msg.SessionID
		c.maxBodySizeBytes = msg.MaxBodySizeBytes
		conn.SetReadLimit(int64(c.maxBodySizeBytes) + int64(protocol.RequestIDLength) + 1024)
		c.mu.Unlock()

		c.emit(TunnelEvent{Type: "status", Status: StatusConnected})
		c.emit(TunnelEvent{
			Type: "authenticated",
			Authenticated: &AuthenticatedInfo{
				URL:              msg.URL,
				TTL:              msg.TTL,
				SessionID:        msg.SessionID,
				MaxBodySizeBytes: msg.MaxBodySizeBytes,
			},
		})

	case *protocol.HttpRequestMessage:
		c.mu.Lock()
		maxBody := c.maxBodySizeBytes
		c.mu.Unlock()

		// Check content-length early
		if cl, ok := caseInsensitiveGet(msg.Headers, "content-length"); ok {
			var size int
			if _, err := fmt.Sscanf(cl, "%d", &size); err == nil && size > maxBody {
				c.sendJSON(ctx, conn, &protocol.ErrorMessage{
					Type:      "error",
					Message:   fmt.Sprintf("Request body exceeds %d byte limit", maxBody),
					RequestID: msg.ID,
					Status:    413,
				})
				return
			}
		}

		if msg.HasBody {
			c.mu.Lock()
			c.requestBodyChunks[msg.ID] = [][]byte{}
			c.requestBodySizes[msg.ID] = 0
			c.pendingRequestMeta[msg.ID] = msg
			c.mu.Unlock()
		} else {
			c.handleHTTPRequest(ctx, conn, msg, nil)
		}

	case *protocol.HttpRequestEndMessage:
		c.mu.Lock()
		chunks := c.requestBodyChunks[msg.ID]
		delete(c.requestBodyChunks, msg.ID)
		reqMeta := c.pendingRequestMeta[msg.ID]
		delete(c.pendingRequestMeta, msg.ID)
		delete(c.requestBodySizes, msg.ID)
		_, oversized := c.oversizedRequestIDs[msg.ID]
		delete(c.oversizedRequestIDs, msg.ID)
		maxBody := c.maxBodySizeBytes
		c.mu.Unlock()

		if reqMeta == nil {
			return
		}

		if oversized {
			c.sendJSON(ctx, conn, &protocol.ErrorMessage{
				Type:      "error",
				Message:   fmt.Sprintf("Request body exceeds %d byte limit", maxBody),
				RequestID: msg.ID,
				Status:    413,
			})
			return
		}

		body := concatChunks(chunks)
		var bodyPtr []byte
		if len(body) > 0 {
			bodyPtr = body
		}
		c.handleHTTPRequest(ctx, conn, reqMeta, bodyPtr)

	case *protocol.HttpBodyChunkMessage:
		// Binary data follows, handled in handleBinaryFrame

	case *protocol.ErrorMessage:
		if msg.Message == "Tunnel TTL expired" {
			c.emit(TunnelEvent{Type: "status", Status: StatusExpired})
			c.emit(TunnelEvent{Type: "expired"})
		} else {
			c.emit(TunnelEvent{Type: "error", Error: fmt.Errorf("%s", msg.Message)})
		}

	case *protocol.PingMsg:
		c.sendJSON(ctx, conn, &protocol.PongMsg{Type: "pong"})
	}
}

func (c *Client) handleBinaryFrame(data []byte) {
	requestID, body, err := protocol.DecodeBinaryFrame(data)
	if err != nil {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	chunks, exists := c.requestBodyChunks[requestID]
	if !exists {
		return
	}
	if _, oversized := c.oversizedRequestIDs[requestID]; oversized {
		return
	}

	nextSize := c.requestBodySizes[requestID] + len(body)
	c.requestBodySizes[requestID] = nextSize

	if nextSize > c.maxBodySizeBytes {
		c.oversizedRequestIDs[requestID] = struct{}{}
		delete(c.requestBodyChunks, requestID)
		return
	}

	c.requestBodyChunks[requestID] = append(chunks, body)
}

func (c *Client) handleHTTPRequest(ctx context.Context, conn *websocket.Conn, msg *protocol.HttpRequestMessage, body []byte) {
	startTime := time.Now()

	c.mu.Lock()
	maxBody := c.maxBodySizeBytes
	c.mu.Unlock()

	resp, err := ProxyRequest(c.opts.Host, c.opts.Port, msg, body, maxBody)
	duration := time.Since(startTime)

	if err != nil {
		status := 502
		errMsg := fmt.Sprintf("Failed to reach localhost:%d: %s", c.opts.Port, err.Error())

		if _, ok := err.(*BodyTooLargeError); ok {
			status = 413
			errMsg = fmt.Sprintf("Response body exceeds %d byte limit", maxBody)
		}

		c.sendJSON(ctx, conn, &protocol.ErrorMessage{
			Type:      "error",
			Message:   errMsg,
			RequestID: msg.ID,
			Status:    status,
		})

		c.emit(TunnelEvent{
			Type: "traffic",
			Traffic: &TrafficEntry{
				ID:        msg.ID,
				Method:    msg.Method,
				Path:      msg.Path,
				Status:    status,
				Duration:  duration,
				Timestamp: time.Now(),
			},
		})
		return
	}

	hasBody := len(resp.Body) > 0

	// Send response metadata
	c.sendJSON(ctx, conn, &protocol.HttpResponseMetaMessage{
		Type:    "http-response-meta",
		ID:      msg.ID,
		Status:  resp.Status,
		Headers: resp.Headers,
		HasBody: hasBody,
	})

	// Send body chunks
	if hasBody {
		chunkSize := 64 * 1024 // 64KB chunks
		for offset := 0; offset < len(resp.Body); offset += chunkSize {
			end := offset + chunkSize
			if end > len(resp.Body) {
				end = len(resp.Body)
			}
			chunk := resp.Body[offset:end]

			c.sendJSON(ctx, conn, &protocol.HttpBodyChunkMessage{
				Type: "http-body-chunk",
				ID:   msg.ID,
				Done: false,
			})

			frame := protocol.EncodeBinaryFrame(msg.ID, chunk)
			if err := conn.Write(ctx, websocket.MessageBinary, frame); err != nil {
				return
			}
		}
	}

	// Send response end
	c.sendJSON(ctx, conn, &protocol.HttpResponseEndMessage{
		Type: "http-response-end",
		ID:   msg.ID,
	})

	c.emit(TunnelEvent{
		Type: "traffic",
		Traffic: &TrafficEntry{
			ID:        msg.ID,
			Method:    msg.Method,
			Path:      msg.Path,
			Status:    resp.Status,
			Duration:  duration,
			Timestamp: time.Now(),
		},
	})
}

func (c *Client) sendJSON(ctx context.Context, conn *websocket.Conn, msg any) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	if err := conn.Write(ctx, websocket.MessageText, data); err != nil {
		return
	}
}

func (c *Client) scheduleReconnect() {
	c.mu.Lock()
	if c.disconnectedIntionally {
		c.mu.Unlock()
		return
	}
	attempt := c.reconnectAttempts
	c.reconnectAttempts++
	c.mu.Unlock()

	if attempt >= protocol.BackoffMaxAttempts {
		c.emit(TunnelEvent{Type: "status", Status: StatusDisconnected})
		return
	}

	c.emit(TunnelEvent{Type: "status", Status: StatusReconnecting})

	delay := CalculateBackoff(attempt)
	time.AfterFunc(delay, func() {
		c.mu.Lock()
		intentional := c.disconnectedIntionally
		c.mu.Unlock()
		if !intentional {
			c.connectLoop()
		}
	})
}

func concatChunks(chunks [][]byte) []byte {
	total := 0
	for _, c := range chunks {
		total += len(c)
	}
	result := make([]byte, 0, total)
	for _, c := range chunks {
		result = append(result, c...)
	}
	return result
}

func caseInsensitiveGet(headers map[string]string, name string) (string, bool) {
	target := name
	for key, value := range headers {
		if len(key) == len(target) {
			match := true
			for i := 0; i < len(key); i++ {
				a, b := key[i], target[i]
				if a >= 'A' && a <= 'Z' {
					a += 32
				}
				if b >= 'A' && b <= 'Z' {
					b += 32
				}
				if a != b {
					match = false
					break
				}
			}
			if match {
				return value, true
			}
		}
	}
	return "", false
}
