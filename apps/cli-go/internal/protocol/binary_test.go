package protocol

import (
	"bytes"
	"testing"
)

func TestBinaryFrameRoundtrip(t *testing.T) {
	reqID := "abcdef123456"
	body := []byte("hello, world!")

	frame := EncodeBinaryFrame(reqID, body)
	gotID, gotBody, err := DecodeBinaryFrame(frame)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotID != reqID {
		t.Errorf("requestID: got %q, want %q", gotID, reqID)
	}
	if !bytes.Equal(gotBody, body) {
		t.Errorf("body: got %q, want %q", gotBody, body)
	}
}

func TestBinaryFrameLayout(t *testing.T) {
	reqID := "abcdef123456"
	body := []byte{0x01, 0x02, 0x03}

	frame := EncodeBinaryFrame(reqID, body)

	if len(frame) != RequestIDLength+len(body) {
		t.Fatalf("frame length: got %d, want %d", len(frame), RequestIDLength+len(body))
	}

	if string(frame[:RequestIDLength]) != reqID {
		t.Errorf("first %d bytes: got %q, want %q", RequestIDLength, string(frame[:RequestIDLength]), reqID)
	}

	if !bytes.Equal(frame[RequestIDLength:], body) {
		t.Errorf("body portion: got %v, want %v", frame[RequestIDLength:], body)
	}
}

func TestBinaryFrameEmptyBody(t *testing.T) {
	reqID := "abcdef123456"
	var body []byte

	frame := EncodeBinaryFrame(reqID, body)
	if len(frame) != RequestIDLength {
		t.Fatalf("frame length with empty body: got %d, want %d", len(frame), RequestIDLength)
	}

	gotID, gotBody, err := DecodeBinaryFrame(frame)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotID != reqID {
		t.Errorf("requestID: got %q, want %q", gotID, reqID)
	}
	if len(gotBody) != 0 {
		t.Errorf("expected empty body, got %d bytes", len(gotBody))
	}
}

func TestBinaryFrameLargeBody(t *testing.T) {
	reqID := "abcdef123456"
	body := make([]byte, 1024*1024) // 1MB
	for i := range body {
		body[i] = byte(i % 256)
	}

	frame := EncodeBinaryFrame(reqID, body)
	gotID, gotBody, err := DecodeBinaryFrame(frame)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotID != reqID {
		t.Errorf("requestID: got %q, want %q", gotID, reqID)
	}
	if !bytes.Equal(gotBody, body) {
		t.Errorf("large body mismatch")
	}
}

func TestDecodeBinaryFrameTooShort(t *testing.T) {
	shortFrames := [][]byte{
		{},
		{0x01},
		{0x01, 0x02, 0x03, 0x04, 0x05},
		make([]byte, RequestIDLength-1),
	}

	for _, frame := range shortFrames {
		_, _, err := DecodeBinaryFrame(frame)
		if err == nil {
			t.Errorf("expected error for frame of length %d, got nil", len(frame))
		}
	}
}
