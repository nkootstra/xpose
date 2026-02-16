package tunnel

import (
	"testing"
	"time"

	"github.com/nkootstra/xpose/internal/protocol"
	"github.com/stretchr/testify/assert"
)

func TestCalculateBackoff_FirstAttempt(t *testing.T) {
	delay := CalculateBackoff(0)
	// base = 1000 * 2^0 = 1000ms, jitter adds 10-20% -> 1100-1200ms
	assert.GreaterOrEqual(t, delay, 1000*time.Millisecond)
	assert.LessOrEqual(t, delay, 1300*time.Millisecond)
}

func TestCalculateBackoff_SecondAttempt(t *testing.T) {
	delay := CalculateBackoff(1)
	// base = 1000 * 2^1 = 2000ms, jitter adds 10-20% -> 2200-2400ms
	assert.GreaterOrEqual(t, delay, 2000*time.Millisecond)
	assert.LessOrEqual(t, delay, 2600*time.Millisecond)
}

func TestCalculateBackoff_CappedAtMax(t *testing.T) {
	delay := CalculateBackoff(10)
	// base = 1000 * 2^10 = 1024000, capped at 30000ms, jitter adds 10-20% -> 33000-36000ms
	maxWithJitter := time.Duration(float64(protocol.BackoffMaxMs)*(1+protocol.BackoffJitterMax)) * time.Millisecond
	assert.LessOrEqual(t, delay, maxWithJitter+100*time.Millisecond)
}

func TestCalculateBackoff_Increases(t *testing.T) {
	// Run multiple times to account for jitter
	var increasing int
	for i := 0; i < 100; i++ {
		d0 := CalculateBackoff(0)
		d1 := CalculateBackoff(1)
		d2 := CalculateBackoff(2)
		if d0 < d1 && d1 < d2 {
			increasing++
		}
	}
	// Should be true most of the time
	assert.Greater(t, increasing, 80)
}
