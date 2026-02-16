package tunnel

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xpose-dev/xpose/internal/protocol"
)

// mockTunnelServer creates a WebSocket server that speaks the xpose protocol.
func mockTunnelServer(t *testing.T, handler func(ctx context.Context, conn *websocket.Conn)) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			t.Logf("websocket accept error: %v", err)
			return
		}
		defer conn.CloseNow()
		handler(r.Context(), conn)
	}))
}

func TestClient_AuthFlow(t *testing.T) {
	server := mockTunnelServer(t, func(ctx context.Context, conn *websocket.Conn) {
		// Read auth message
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}

		var auth protocol.AuthMessage
		json.Unmarshal(data, &auth)
		assert.Equal(t, "auth", auth.Type)
		assert.Equal(t, "test-sub", auth.Subdomain)

		// Send auth-ack
		ack := protocol.AuthAckMessage{
			Type:             "auth-ack",
			Subdomain:        "test-sub",
			URL:              "https://test-sub.xpose.dev",
			TTL:              3600,
			SessionID:        "session-123",
			MaxBodySizeBytes: 5 * 1024 * 1024,
		}
		ackData, _ := json.Marshal(ack)
		conn.Write(ctx, websocket.MessageText, ackData)

		// Keep connection open briefly
		time.Sleep(200 * time.Millisecond)
	})
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	client := &Client{
		opts: ClientOptions{
			Subdomain: "test-sub",
			Port:      3000,
			TTL:       3600,
			Host:      "localhost",
		},
		Events:              make(chan TunnelEvent, 100),
		wsURL:               wsURL + protocol.TunnelConnectPath,
		maxBodySizeBytes:    protocol.DefaultMaxBodySizeBytes,
		requestBodyChunks:   make(map[string][][]byte),
		requestBodySizes:    make(map[string]int),
		oversizedRequestIDs: make(map[string]struct{}),
		pendingRequestMeta:  make(map[string]*protocol.HttpRequestMessage),
	}

	go client.connectLoop()

	// Collect events
	var events []TunnelEvent
	timeout := time.After(2 * time.Second)
	for {
		select {
		case ev := <-client.Events:
			events = append(events, ev)
			if ev.Type == "authenticated" {
				goto done
			}
		case <-timeout:
			t.Fatal("timed out waiting for events")
		}
	}
done:

	// Should have connecting + connected + authenticated
	require.NotEmpty(t, events)

	var gotAuth *AuthenticatedInfo
	for _, ev := range events {
		if ev.Authenticated != nil {
			gotAuth = ev.Authenticated
		}
	}

	require.NotNil(t, gotAuth)
	assert.Equal(t, "https://test-sub.xpose.dev", gotAuth.URL)
	assert.Equal(t, 3600, gotAuth.TTL)
	assert.Equal(t, "session-123", gotAuth.SessionID)
	assert.Equal(t, 5*1024*1024, gotAuth.MaxBodySizeBytes)
}

func TestClient_ProxiesHTTPRequest(t *testing.T) {
	// Local server that the tunnel will proxy to
	localServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Test", "proxied")
		w.WriteHeader(200)
		w.Write([]byte("ok"))
	}))
	defer localServer.Close()

	localHost, localPort := parseHostPort(localServer.URL)

	server := mockTunnelServer(t, func(ctx context.Context, conn *websocket.Conn) {
		// Read auth
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}

		var auth protocol.AuthMessage
		json.Unmarshal(data, &auth)

		// Send auth-ack
		ack := protocol.AuthAckMessage{
			Type:             "auth-ack",
			Subdomain:        auth.Subdomain,
			URL:              "https://test.xpose.dev",
			TTL:              3600,
			SessionID:        "sess-1",
			MaxBodySizeBytes: 5 * 1024 * 1024,
		}
		ackData, _ := json.Marshal(ack)
		conn.Write(ctx, websocket.MessageText, ackData)

		// Short delay so client processes auth-ack
		time.Sleep(50 * time.Millisecond)

		// Send an HTTP request message
		reqMsg := protocol.HttpRequestMessage{
			Type:    "http-request",
			ID:      "req-abc123abc1",
			Method:  "GET",
			Path:    "/hello",
			Headers: map[string]string{},
			HasBody: false,
		}
		reqData, _ := json.Marshal(reqMsg)
		conn.Write(ctx, websocket.MessageText, reqData)

		// Read response messages
		for i := 0; i < 10; i++ {
			msgType, respData, err := conn.Read(ctx)
			if err != nil {
				return
			}
			if msgType == websocket.MessageText {
				var env protocol.Envelope
				json.Unmarshal(respData, &env)
				if env.Type == "http-response-end" {
					return
				}
			}
		}
	})
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	client := &Client{
		opts: ClientOptions{
			Subdomain: "proxy-test",
			Port:      localPort,
			TTL:       3600,
			Host:      localHost,
		},
		Events:              make(chan TunnelEvent, 100),
		wsURL:               wsURL + protocol.TunnelConnectPath,
		maxBodySizeBytes:    protocol.DefaultMaxBodySizeBytes,
		requestBodyChunks:   make(map[string][][]byte),
		requestBodySizes:    make(map[string]int),
		oversizedRequestIDs: make(map[string]struct{}),
		pendingRequestMeta:  make(map[string]*protocol.HttpRequestMessage),
	}

	go client.connectLoop()

	// Wait for traffic event
	timeout := time.After(3 * time.Second)
	for {
		select {
		case ev := <-client.Events:
			if ev.Traffic != nil {
				assert.Equal(t, "GET", ev.Traffic.Method)
				assert.Equal(t, "/hello", ev.Traffic.Path)
				assert.Equal(t, 200, ev.Traffic.Status)
				return
			}
		case <-timeout:
			t.Fatal("timed out waiting for traffic event")
		}
	}
}

func TestClient_TTLExpired(t *testing.T) {
	server := mockTunnelServer(t, func(ctx context.Context, conn *websocket.Conn) {
		// Read auth
		conn.Read(ctx)

		// Send auth-ack
		ack := protocol.AuthAckMessage{
			Type:             "auth-ack",
			Subdomain:        "test",
			URL:              "https://test.xpose.dev",
			TTL:              1,
			SessionID:        "sess-1",
			MaxBodySizeBytes: 5 * 1024 * 1024,
		}
		ackData, _ := json.Marshal(ack)
		conn.Write(ctx, websocket.MessageText, ackData)

		time.Sleep(50 * time.Millisecond)

		// Send TTL expired error
		errMsg := protocol.ErrorMessage{
			Type:    "error",
			Message: "Tunnel TTL expired",
		}
		errData, _ := json.Marshal(errMsg)
		conn.Write(ctx, websocket.MessageText, errData)

		time.Sleep(100 * time.Millisecond)
	})
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	client := &Client{
		opts: ClientOptions{
			Subdomain: "test-ttl",
			Port:      3000,
			TTL:       1,
			Host:      "localhost",
		},
		Events:              make(chan TunnelEvent, 100),
		wsURL:               wsURL + protocol.TunnelConnectPath,
		maxBodySizeBytes:    protocol.DefaultMaxBodySizeBytes,
		requestBodyChunks:   make(map[string][][]byte),
		requestBodySizes:    make(map[string]int),
		oversizedRequestIDs: make(map[string]struct{}),
		pendingRequestMeta:  make(map[string]*protocol.HttpRequestMessage),
	}

	go client.connectLoop()

	gotExpired := false
	timeout := time.After(3 * time.Second)
	for {
		select {
		case ev := <-client.Events:
			if ev.Type == "expired" {
				gotExpired = true
				goto done
			}
			if ev.Status == StatusExpired {
				gotExpired = true
				goto done
			}
		case <-timeout:
			goto done
		}
	}
done:
	assert.True(t, gotExpired, "expected expired event")
}
