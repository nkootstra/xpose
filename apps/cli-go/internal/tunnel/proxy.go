package tunnel

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/xpose-dev/xpose/internal/protocol"
)

// ProxyResponse holds the result of proxying a request to the local server.
type ProxyResponse struct {
	Status  int
	Headers map[string]string
	Body    []byte
}

// skipHeaders are headers that should not be forwarded to the local server.
var skipHeaders = map[string]bool{
	"host":              true,
	"connection":        true,
	"transfer-encoding": true,
}

// ProxyRequest forwards an HTTP request to the local server and returns the response.
func ProxyRequest(host string, port int, msg *protocol.HttpRequestMessage, body []byte, maxBodySize int) (*ProxyResponse, error) {
	localURL := fmt.Sprintf("http://%s:%d%s", host, port, msg.Path)

	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}

	req, err := http.NewRequest(msg.Method, localURL, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	for key, value := range msg.Headers {
		if skipHeaders[strings.ToLower(key)] {
			continue
		}
		req.Header.Set(key, value)
	}

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach localhost:%d: %w", port, err)
	}
	defer resp.Body.Close()

	// Check content-length before reading
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		if size, err := strconv.ParseInt(cl, 10, 64); err == nil && size > int64(maxBodySize) {
			return nil, &BodyTooLargeError{Limit: maxBodySize}
		}
	}

	// Read body with limit
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, int64(maxBodySize)+1))
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if len(respBody) > maxBodySize {
		return nil, &BodyTooLargeError{Limit: maxBodySize}
	}

	headers := make(map[string]string)
	for key := range resp.Header {
		headers[key] = resp.Header.Get(key)
	}

	return &ProxyResponse{
		Status:  resp.StatusCode,
		Headers: headers,
		Body:    respBody,
	}, nil
}

// BodyTooLargeError indicates the response body exceeded the size limit.
type BodyTooLargeError struct {
	Limit int
}

func (e *BodyTooLargeError) Error() string {
	return fmt.Sprintf("response body exceeds %d byte limit", e.Limit)
}
