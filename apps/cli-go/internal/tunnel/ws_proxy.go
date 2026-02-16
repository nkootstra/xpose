package tunnel

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/coder/websocket"

	"github.com/nkootstra/xpose/internal/protocol"
)

// splitCSV splits a comma-separated header value into trimmed tokens.
func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// wsRelay manages the relay of a single browser WebSocket connection through
// the tunnel to a local WebSocket server.
type wsRelay struct {
	streamID  string
	localConn *websocket.Conn
	cancel    context.CancelFunc
}

// wsRelayManager tracks active WebSocket relay connections.
type wsRelayManager struct {
	mu     sync.Mutex
	relays map[string]*wsRelay
	host   string
	port   int
}

func newWsRelayManager(host string, port int) *wsRelayManager {
	return &wsRelayManager{
		relays: make(map[string]*wsRelay),
		host:   host,
		port:   port,
	}
}

// handleUpgrade processes a ws-upgrade request from the server: dials the local
// WebSocket endpoint and starts relaying frames.
func (mgr *wsRelayManager) handleUpgrade(
	ctx context.Context,
	tunnelConn *websocket.Conn,
	msg *protocol.WsUpgradeMessage,
	sendJSON func(ctx context.Context, conn *websocket.Conn, msg any),
) {
	localURL := fmt.Sprintf("ws://%s:%d%s", mgr.host, mgr.port, msg.Path)

	// Build request headers (forward relevant ones)
	reqHeaders := make(http.Header)
	var subprotocols []string
	for k, v := range msg.Headers {
		switch k {
		case "host", "upgrade", "connection",
			"sec-websocket-key", "sec-websocket-version",
			"sec-websocket-extensions":
			// Don't forward WebSocket handshake headers — the local dial creates its own
			continue
		case "sec-websocket-protocol":
			// Parse subprotocols and pass them via DialOptions.Subprotocols
			for _, p := range splitCSV(v) {
				subprotocols = append(subprotocols, p)
			}
		default:
			reqHeaders.Set(k, v)
		}
	}

	dialCtx, dialCancel := context.WithCancel(ctx)
	localConn, _, err := websocket.Dial(dialCtx, localURL, &websocket.DialOptions{
		HTTPHeader:   reqHeaders,
		Subprotocols: subprotocols,
	})
	if err != nil {
		dialCancel()
		sendJSON(ctx, tunnelConn, &protocol.WsUpgradeAckMessage{
			Type:     "ws-upgrade-ack",
			StreamID: msg.StreamID,
			OK:       false,
			Error:    fmt.Sprintf("Failed to connect to %s: %s", localURL, err.Error()),
		})
		return
	}

	// Set a large read limit
	localConn.SetReadLimit(32 * 1024 * 1024) // 32MB for WS frames

	relay := &wsRelay{
		streamID:  msg.StreamID,
		localConn: localConn,
		cancel:    dialCancel,
	}

	mgr.mu.Lock()
	mgr.relays[msg.StreamID] = relay
	mgr.mu.Unlock()

	// Confirm success
	sendJSON(ctx, tunnelConn, &protocol.WsUpgradeAckMessage{
		Type:     "ws-upgrade-ack",
		StreamID: msg.StreamID,
		OK:       true,
	})

	// Start reading from local WS and forwarding to tunnel
	go mgr.readLocalAndForward(ctx, tunnelConn, relay, sendJSON)
}

// readLocalAndForward reads frames from the local WebSocket and forwards them
// through the tunnel to the browser.
func (mgr *wsRelayManager) readLocalAndForward(
	ctx context.Context,
	tunnelConn *websocket.Conn,
	relay *wsRelay,
	sendJSON func(ctx context.Context, conn *websocket.Conn, msg any),
) {
	defer mgr.closeRelay(relay.streamID)

	for {
		msgType, data, err := relay.localConn.Read(ctx)
		if err != nil {
			// Local WS closed — notify tunnel
			sendJSON(ctx, tunnelConn, &protocol.WsCloseMessage{
				Type:     "ws-close",
				StreamID: relay.streamID,
				Code:     1000,
				Reason:   "Local WebSocket closed",
			})
			return
		}

		var frameType string
		if msgType == websocket.MessageText {
			frameType = "text"
		} else {
			frameType = "binary"
		}

		// Send ws-frame header
		sendJSON(ctx, tunnelConn, &protocol.WsFrameMessage{
			Type:      "ws-frame",
			StreamID:  relay.streamID,
			FrameType: frameType,
		})

		// Send binary frame with streamId prefix + data
		frame := protocol.EncodeBinaryFrame(relay.streamID, data)
		if err := tunnelConn.Write(ctx, websocket.MessageBinary, frame); err != nil {
			return
		}
	}
}

// handleFrame forwards a WS frame from the browser (via tunnel) to the local WS.
func (mgr *wsRelayManager) handleFrame(msg *protocol.WsFrameMessage, body []byte) {
	mgr.mu.Lock()
	relay, exists := mgr.relays[msg.StreamID]
	mgr.mu.Unlock()
	if !exists {
		return
	}

	ctx := context.Background()
	var msgType websocket.MessageType
	if msg.FrameType == "text" {
		msgType = websocket.MessageText
	} else {
		msgType = websocket.MessageBinary
	}

	if err := relay.localConn.Write(ctx, msgType, body); err != nil {
		mgr.closeRelay(msg.StreamID)
	}
}

// handleClose closes a relay stream.
func (mgr *wsRelayManager) handleClose(msg *protocol.WsCloseMessage) {
	mgr.closeRelay(msg.StreamID)
}

// closeRelay tears down a relay connection.
func (mgr *wsRelayManager) closeRelay(streamID string) {
	mgr.mu.Lock()
	relay, exists := mgr.relays[streamID]
	if exists {
		delete(mgr.relays, streamID)
	}
	mgr.mu.Unlock()

	if relay != nil {
		relay.cancel()
		relay.localConn.Close(websocket.StatusNormalClosure, "Stream closed")
	}
}

// closeAll tears down all active relay connections.
func (mgr *wsRelayManager) closeAll() {
	mgr.mu.Lock()
	relays := make(map[string]*wsRelay, len(mgr.relays))
	for k, v := range mgr.relays {
		relays[k] = v
	}
	mgr.relays = make(map[string]*wsRelay)
	mgr.mu.Unlock()

	for _, relay := range relays {
		relay.cancel()
		relay.localConn.Close(websocket.StatusNormalClosure, "All streams closed")
	}
}
