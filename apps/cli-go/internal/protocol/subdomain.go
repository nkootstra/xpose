package protocol

import (
	"crypto/rand"
	"regexp"
	"strings"
)

var (
	validSubdomainRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)
	sanitizeRe       = regexp.MustCompile(`[^a-z0-9-]`)
)

// generateRandomString produces a cryptographically random string of the given
// length using characters from SubdomainAlphabet.
func generateRandomString(length int) string {
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		panic("crypto/rand: " + err.Error())
	}
	alphabetLen := len(SubdomainAlphabet)
	result := make([]byte, length)
	for i, b := range buf {
		result[i] = SubdomainAlphabet[int(b)%alphabetLen]
	}
	return string(result)
}

// GenerateSubdomainID returns a random subdomain identifier of SubdomainLength characters.
func GenerateSubdomainID() string {
	return generateRandomString(SubdomainLength)
}

// GenerateRequestID returns a random request identifier of RequestIDLength characters.
func GenerateRequestID() string {
	return generateRandomString(RequestIDLength)
}

// BuildCustomSubdomain takes a user-supplied prefix, sanitizes it, and appends
// a random suffix. If the prefix is empty or contains only invalid characters,
// a fully random subdomain is returned instead.
func BuildCustomSubdomain(prefix string) string {
	cleaned := sanitizeRe.ReplaceAllString(strings.ToLower(prefix), "")
	cleaned = strings.Trim(cleaned, "-")

	if cleaned == "" {
		return GenerateSubdomainID()
	}

	suffix := generateRandomString(SubdomainSuffixLength)
	return cleaned + "-" + suffix
}

// ValidateSubdomain checks whether a subdomain string is valid.
// It returns (true, "") on success, or (false, reason) on failure.
func ValidateSubdomain(subdomain string) (bool, string) {
	if len(subdomain) == 0 {
		return false, "subdomain must not be empty"
	}
	if len(subdomain) > 63 {
		return false, "subdomain must be at most 63 characters"
	}
	if !validSubdomainRe.MatchString(subdomain) {
		return false, "subdomain must contain only lowercase alphanumeric characters and hyphens, and must not start or end with a hyphen"
	}
	return true, ""
}
