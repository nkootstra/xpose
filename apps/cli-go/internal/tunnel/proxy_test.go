package tunnel

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/nkootstra/xpose/internal/protocol"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func parseHostPort(url string) (string, int) {
	// url is like http://127.0.0.1:PORT
	parts := strings.Split(url, ":")
	port := 0
	if _, err := fmt.Sscanf(parts[len(parts)-1], "%d", &port); err != nil {
		return "", 0
	}
	host := strings.TrimPrefix(strings.Join(parts[:len(parts)-1], ":"), "http://")
	return host, port
}

func TestProxyRequest_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/test", r.URL.Path)
		assert.Equal(t, "GET", r.Method)
		w.Header().Set("X-Custom", "value")
		w.WriteHeader(200)
		if _, err := w.Write([]byte("hello world")); err != nil {
			t.Errorf("failed to write response body: %v", err)
		}
	}))
	defer server.Close()

	host, port := parseHostPort(server.URL)

	resp, err := ProxyRequest(host, port, &protocol.HttpRequestMessage{
		Type:    "http-request",
		ID:      "req-1",
		Method:  "GET",
		Path:    "/test",
		Headers: map[string]string{},
	}, nil, 5*1024*1024)

	require.NoError(t, err)
	assert.Equal(t, 200, resp.Status)
	assert.Equal(t, "hello world", string(resp.Body))
	assert.Equal(t, "value", resp.Headers["X-Custom"])
}

func TestProxyRequest_PostWithBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		body := make([]byte, 1024)
		n, _ := r.Body.Read(body)
		if _, err := w.Write(body[:n]); err != nil {
			t.Errorf("failed to write response body: %v", err)
		}
	}))
	defer server.Close()

	host, port := parseHostPort(server.URL)

	resp, err := ProxyRequest(host, port, &protocol.HttpRequestMessage{
		Type:    "http-request",
		ID:      "req-2",
		Method:  "POST",
		Path:    "/submit",
		Headers: map[string]string{"Content-Type": "application/json"},
		HasBody: true,
	}, []byte(`{"key":"value"}`), 5*1024*1024)

	require.NoError(t, err)
	assert.Equal(t, 200, resp.Status)
	assert.Equal(t, `{"key":"value"}`, string(resp.Body))
}

func TestProxyRequest_ConnectionRefused(t *testing.T) {
	_, err := ProxyRequest("127.0.0.1", 1, &protocol.HttpRequestMessage{
		Type:    "http-request",
		ID:      "req-3",
		Method:  "GET",
		Path:    "/",
		Headers: map[string]string{},
	}, nil, 5*1024*1024)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to reach localhost:1")
}

func TestProxyRequest_OversizedResponse(t *testing.T) {
	bigBody := strings.Repeat("x", 1024)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := w.Write([]byte(bigBody)); err != nil {
			t.Errorf("failed to write oversized response body: %v", err)
		}
	}))
	defer server.Close()

	host, port := parseHostPort(server.URL)

	_, err := ProxyRequest(host, port, &protocol.HttpRequestMessage{
		Type:    "http-request",
		ID:      "req-4",
		Method:  "GET",
		Path:    "/",
		Headers: map[string]string{},
	}, nil, 100) // 100 byte limit

	require.Error(t, err)
	_, ok := err.(*BodyTooLargeError)
	assert.True(t, ok, "expected BodyTooLargeError")
}

func TestProxyRequest_OversizedResponseContentLength(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "999999")
		w.WriteHeader(200)
	}))
	defer server.Close()

	host, port := parseHostPort(server.URL)

	_, err := ProxyRequest(host, port, &protocol.HttpRequestMessage{
		Type:    "http-request",
		ID:      "req-5",
		Method:  "GET",
		Path:    "/",
		Headers: map[string]string{},
	}, nil, 100)

	require.Error(t, err)
	_, ok := err.(*BodyTooLargeError)
	assert.True(t, ok, "expected BodyTooLargeError")
}

func TestProxyRequest_SkipsHopByHopHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// host header should be the server's address, not forwarded
		assert.NotEqual(t, "evil.com", r.Host)
		assert.Empty(t, r.Header.Get("Connection"))
		assert.Empty(t, r.Header.Get("Transfer-Encoding"))
		w.WriteHeader(200)
	}))
	defer server.Close()

	host, port := parseHostPort(server.URL)

	resp, err := ProxyRequest(host, port, &protocol.HttpRequestMessage{
		Type:   "http-request",
		ID:     "req-6",
		Method: "GET",
		Path:   "/",
		Headers: map[string]string{
			"Host":              "evil.com",
			"Connection":        "keep-alive",
			"Transfer-Encoding": "chunked",
			"X-Custom":          "keep-me",
		},
	}, nil, 5*1024*1024)

	require.NoError(t, err)
	assert.Equal(t, 200, resp.Status)
}

func TestProxyRequest_FollowsNoRedirects(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/redirected", http.StatusFound)
	}))
	defer server.Close()

	host, port := parseHostPort(server.URL)

	resp, err := ProxyRequest(host, port, &protocol.HttpRequestMessage{
		Type:    "http-request",
		ID:      "req-7",
		Method:  "GET",
		Path:    "/",
		Headers: map[string]string{},
	}, nil, 5*1024*1024)

	require.NoError(t, err)
	assert.Equal(t, 302, resp.Status)
}
