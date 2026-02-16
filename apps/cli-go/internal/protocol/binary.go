package protocol

import "fmt"

// EncodeBinaryFrame creates a binary frame by prepending the request ID to the body.
// The first RequestIDLength bytes contain the request ID, followed by the body bytes.
func EncodeBinaryFrame(requestID string, body []byte) []byte {
	frame := make([]byte, RequestIDLength+len(body))
	copy(frame[:RequestIDLength], []byte(requestID))
	copy(frame[RequestIDLength:], body)
	return frame
}

// DecodeBinaryFrame extracts the request ID and body from a binary frame.
// Returns an error if the frame is shorter than RequestIDLength bytes.
func DecodeBinaryFrame(frame []byte) (requestID string, body []byte, err error) {
	if len(frame) < RequestIDLength {
		return "", nil, fmt.Errorf("frame too short: %d bytes", len(frame))
	}
	requestID = string(frame[:RequestIDLength])
	body = frame[RequestIDLength:]
	return requestID, body, nil
}
