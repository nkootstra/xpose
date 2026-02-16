package protocol

import (
	"strings"
	"testing"
)

func TestSubdomainAlphabetContainsOnlyValidChars(t *testing.T) {
	for _, c := range SubdomainAlphabet {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
			t.Errorf("SubdomainAlphabet contains invalid character: %c", c)
		}
	}
}

func TestSubdomainAlphabetLength(t *testing.T) {
	if len(SubdomainAlphabet) != 36 {
		t.Errorf("expected SubdomainAlphabet length 36, got %d", len(SubdomainAlphabet))
	}
}

func TestDefaultTTLLessThanMaxTTL(t *testing.T) {
	if DefaultTTLSeconds >= MaxTTLSeconds {
		t.Errorf("expected DefaultTTLSeconds (%d) < MaxTTLSeconds (%d)", DefaultTTLSeconds, MaxTTLSeconds)
	}
}

func TestBackoffValues(t *testing.T) {
	if BackoffBaseMs >= BackoffMaxMs {
		t.Errorf("expected BackoffBaseMs (%d) < BackoffMaxMs (%d)", BackoffBaseMs, BackoffMaxMs)
	}
	if BackoffJitterMin >= BackoffJitterMax {
		t.Errorf("expected BackoffJitterMin (%f) < BackoffJitterMax (%f)", BackoffJitterMin, BackoffJitterMax)
	}
	if BackoffMaxAttempts <= 0 {
		t.Errorf("expected BackoffMaxAttempts > 0, got %d", BackoffMaxAttempts)
	}
}

func TestTunnelConnectPath(t *testing.T) {
	if !strings.HasPrefix(TunnelConnectPath, "/") {
		t.Errorf("TunnelConnectPath should start with /, got %q", TunnelConnectPath)
	}
}

func TestRequestIDLength(t *testing.T) {
	if RequestIDLength != 12 {
		t.Errorf("expected RequestIDLength 12, got %d", RequestIDLength)
	}
}

func TestSubdomainLengthConst(t *testing.T) {
	if SubdomainLength != 12 {
		t.Errorf("expected SubdomainLength 12, got %d", SubdomainLength)
	}
}

func TestPingPongText(t *testing.T) {
	if PingText != "ping" {
		t.Errorf("expected PingText %q, got %q", "ping", PingText)
	}
	if PongText != "pong" {
		t.Errorf("expected PongText %q, got %q", "pong", PongText)
	}
}
