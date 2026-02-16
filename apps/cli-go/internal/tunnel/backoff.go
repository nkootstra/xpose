package tunnel

import (
	"math"
	"math/rand"
	"time"

	"github.com/nkootstra/xpose/internal/protocol"
)

// CalculateBackoff computes the delay before the next reconnection attempt
// using exponential backoff with jitter. The formula matches the TypeScript
// implementation exactly.
func CalculateBackoff(attempt int) time.Duration {
	base := float64(protocol.BackoffBaseMs) * math.Pow(float64(protocol.BackoffMultiplier), float64(attempt))
	delay := math.Min(base, float64(protocol.BackoffMaxMs))
	jitter := delay * (protocol.BackoffJitterMin + rand.Float64()*(protocol.BackoffJitterMax-protocol.BackoffJitterMin))
	return time.Duration(delay+jitter) * time.Millisecond
}
