package service

import (
	"chatgpt2api/internal/util"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"math/big"
	"net/url"
	"strings"
)

func registerRandomPassword(length int) string {
	if length < 8 {
		length = 8
	}
	upper := "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	lower := "abcdefghijklmnopqrstuvwxyz"
	digits := "0123456789"
	special := "!@#$%"
	all := upper + lower + digits + special
	value := []byte{
		upper[registerRandomIndex(len(upper))],
		lower[registerRandomIndex(len(lower))],
		digits[registerRandomIndex(len(digits))],
		special[registerRandomIndex(len(special))],
	}
	for len(value) < length {
		value = append(value, all[registerRandomIndex(len(all))])
	}
	for i := len(value) - 1; i > 0; i-- {
		j := registerRandomIndex(i + 1)
		value[i], value[j] = value[j], value[i]
	}
	return string(value)
}

func registerRandomName() (string, string) {
	return registerFirstNames[registerRandomIndex(len(registerFirstNames))], registerLastNames[registerRandomIndex(len(registerLastNames))]
}

func registerRandomBirthdate() string {
	year := 1996 + registerRandomIndex(11)
	month := 1 + registerRandomIndex(12)
	day := 1 + registerRandomIndex(28)
	return fmt.Sprintf("%04d-%02d-%02d", year, month, day)
}

func registerRandomToken() string {
	return util.RandomTokenURL(24)
}

func generateRegisterPKCE() (string, string) {
	buf := util.MustRandomBytes(64)
	verifier := base64.RawURLEncoding.EncodeToString(buf)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	return verifier, challenge
}

func registerAuthorizeParams(email, deviceID, state, nonce, codeChallenge string) url.Values {
	values := url.Values{}
	values.Set("issuer", registerAuthBase)
	values.Set("client_id", registerPlatformOAuthClientID)
	values.Set("audience", registerPlatformOAuthAudience)
	values.Set("redirect_uri", registerPlatformOAuthRedirectURI)
	values.Set("device_id", deviceID)
	values.Set("screen_hint", "login_or_signup")
	values.Set("max_age", "0")
	values.Set("login_hint", email)
	values.Set("scope", "openid profile email offline_access")
	values.Set("response_type", "code")
	values.Set("response_mode", "query")
	values.Set("state", state)
	values.Set("nonce", nonce)
	values.Set("code_challenge", codeChallenge)
	values.Set("code_challenge_method", "S256")
	values.Set("auth0Client", registerPlatformAuth0Client)
	return values
}

func registerOAuthCode(target string) string {
	if strings.TrimSpace(target) == "" {
		return ""
	}
	parsed, err := url.Parse(target)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(parsed.Query().Get("code"))
}

func registerRandomUint64() uint64 {
	return binary.BigEndian.Uint64(util.MustRandomBytes(8))
}

func registerRandomIndex(length int) int {
	if length <= 0 {
		panic("random choice requires non-empty input")
	}
	value, err := rand.Int(rand.Reader, big.NewInt(int64(length)))
	if err != nil {
		panic(fmt.Errorf("crypto/rand failed: %w", err))
	}
	return int(value.Int64())
}

func registerRandomChoice(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[registerRandomIndex(len(values))]
}

func registerRandomChoiceInt(values []int) int {
	if len(values) == 0 {
		return 0
	}
	return values[registerRandomIndex(len(values))]
}
