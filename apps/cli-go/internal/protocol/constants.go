package protocol

const (
	SubdomainLength            = 12
	SubdomainSuffixLength      = 6
	SubdomainAlphabet          = "abcdefghijklmnopqrstuvwxyz0123456789"
	RequestIDLength            = 12
	RequestTimeoutMs           = 30_000
	ReconnectGracePeriodMs     = 5_000
	DefaultMaxBodySizeBytes    = 5 * 1024 * 1024
	BackoffBaseMs              = 1_000
	BackoffMultiplier          = 2
	BackoffMaxMs               = 30_000
	BackoffMaxAttempts         = 15
	BackoffJitterMin           = 0.1
	BackoffJitterMax           = 0.2
	DefaultTTLSeconds          = 14_400
	MaxTTLSeconds              = 86_400
	TunnelConnectPath          = "/_tunnel/connect"
	DefaultPublicDomain        = "xpose.dev"
	PingText                   = "ping"
	PongText                   = "pong"
	SessionResumeWindowSeconds = 600
)
