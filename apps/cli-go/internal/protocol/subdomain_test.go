package protocol

import (
	"strings"
	"testing"
)

func TestGenerateSubdomainIDLength(t *testing.T) {
	id := GenerateSubdomainID()
	if len(id) != SubdomainLength {
		t.Errorf("expected length %d, got %d: %q", SubdomainLength, len(id), id)
	}
}

func TestGenerateSubdomainIDValidChars(t *testing.T) {
	id := GenerateSubdomainID()
	for _, c := range id {
		if !strings.ContainsRune(SubdomainAlphabet, c) {
			t.Errorf("generated ID contains invalid character %c in %q", c, id)
		}
	}
}

func TestGenerateRequestIDLength(t *testing.T) {
	id := GenerateRequestID()
	if len(id) != RequestIDLength {
		t.Errorf("expected length %d, got %d: %q", RequestIDLength, len(id), id)
	}
}

func TestGenerateRequestIDValidChars(t *testing.T) {
	id := GenerateRequestID()
	for _, c := range id {
		if !strings.ContainsRune(SubdomainAlphabet, c) {
			t.Errorf("generated ID contains invalid character %c in %q", c, id)
		}
	}
}

func TestGenerateIDUniqueness(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		id := GenerateSubdomainID()
		if seen[id] {
			t.Errorf("duplicate ID generated: %q", id)
		}
		seen[id] = true
	}
}

func TestBuildCustomSubdomainSanitizes(t *testing.T) {
	result := BuildCustomSubdomain("My-App!")
	if !strings.HasPrefix(result, "my-app-") {
		t.Errorf("expected prefix %q, got %q", "my-app-", result)
	}
	expectedLen := len("my-app-") + SubdomainSuffixLength
	if len(result) != expectedLen {
		t.Errorf("expected length %d, got %d: %q", expectedLen, len(result), result)
	}
}

func TestBuildCustomSubdomainEmptyPrefix(t *testing.T) {
	result := BuildCustomSubdomain("")
	if len(result) != SubdomainLength {
		t.Errorf("expected fallback to random ID of length %d, got %d: %q", SubdomainLength, len(result), result)
	}
}

func TestBuildCustomSubdomainSpecialCharsOnly(t *testing.T) {
	result := BuildCustomSubdomain("!@#$%")
	if len(result) != SubdomainLength {
		t.Errorf("expected fallback to random ID of length %d, got %d: %q", SubdomainLength, len(result), result)
	}
}

func TestBuildCustomSubdomainHyphensOnly(t *testing.T) {
	result := BuildCustomSubdomain("---")
	if len(result) != SubdomainLength {
		t.Errorf("expected fallback to random ID of length %d, got %d: %q", SubdomainLength, len(result), result)
	}
}

func TestBuildCustomSubdomainUppercase(t *testing.T) {
	result := BuildCustomSubdomain("MyApp")
	if !strings.HasPrefix(result, "myapp-") {
		t.Errorf("expected prefix %q, got %q", "myapp-", result)
	}
}

func TestValidateSubdomainValid(t *testing.T) {
	valid := []string{
		"a",
		"abc",
		"my-app",
		"test123",
		"a-b-c-d",
		"abc123def456",
		strings.Repeat("a", 63),
	}
	for _, s := range valid {
		ok, reason := ValidateSubdomain(s)
		if !ok {
			t.Errorf("ValidateSubdomain(%q) should be valid, got reason: %s", s, reason)
		}
	}
}

func TestValidateSubdomainEmpty(t *testing.T) {
	ok, _ := ValidateSubdomain("")
	if ok {
		t.Error("empty subdomain should be invalid")
	}
}

func TestValidateSubdomainTooLong(t *testing.T) {
	ok, _ := ValidateSubdomain(strings.Repeat("a", 64))
	if ok {
		t.Error("64-char subdomain should be invalid")
	}
}

func TestValidateSubdomainUppercase(t *testing.T) {
	ok, _ := ValidateSubdomain("MyApp")
	if ok {
		t.Error("uppercase subdomain should be invalid")
	}
}

func TestValidateSubdomainSpecialChars(t *testing.T) {
	invalid := []string{
		"my_app",
		"my.app",
		"my app",
		"my@app",
		"my!app",
	}
	for _, s := range invalid {
		ok, _ := ValidateSubdomain(s)
		if ok {
			t.Errorf("ValidateSubdomain(%q) should be invalid", s)
		}
	}
}

func TestValidateSubdomainLeadingTrailingHyphens(t *testing.T) {
	invalid := []string{
		"-abc",
		"abc-",
		"-abc-",
		"-",
	}
	for _, s := range invalid {
		ok, _ := ValidateSubdomain(s)
		if ok {
			t.Errorf("ValidateSubdomain(%q) with leading/trailing hyphens should be invalid", s)
		}
	}
}
