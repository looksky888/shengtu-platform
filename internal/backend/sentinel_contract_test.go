package backend

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func sentinelFixtureP(t *testing.T) string {
	t.Helper()
	fields := make([]any, 25)
	fields[4], fields[7] = browserUserAgent, "en-US"
	data, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	return "gAAAAAC" + base64.StdEncoding.EncodeToString(data)
}

func sentinelFixtureSolver(t *testing.T) string {
	t.Helper()
	p := sentinelFixtureP(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+strings.Repeat("k", 32) {
			t.Error("wrong solver auth")
		}
		if r.Header.Get("Cookie") != "" {
			t.Error("cookie leaked to solver")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		switch r.URL.Path {
		case "/v1/context":
			if len(body) != 2 || body["proxy_url"] != "" || body["timezone"] != "" {
				t.Error("context received unexpected account data")
			}
			json.NewEncoder(w).Encode(sentinelContext{ID: "fixture", P: p, UserAgent: browserUserAgent, Language: "en-US", Timezone: "Asia/Tokyo", Offset: -540})
		case "/v1/turnstile":
			requirements := util.StringMap(body["requirements"])
			if len(body) != 4 || body["p"] != p || body["context_id"] != "fixture" || body["dx"] != "dx-fixture" || requirements["prepare_token"] != "prepare-fixture" {
				t.Error("incorrect challenge-only contract")
			}
			json.NewEncoder(w).Encode(map[string]string{"token": "turnstile-fixture"})
		default:
			t.Errorf("unexpected solver path %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_URL", server.URL)
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_KEY", strings.Repeat("k", 32))
	return p
}

type sentinelAccountLookup map[string]map[string]any

func (l sentinelAccountLookup) GetAccount(token string) map[string]any { return l[token] }

func TestSentinelUsesSelectedAccountProxyAndTimezone(t *testing.T) {
	const proxyURL = "http://user-session:secret@proxy.example:8080"
	const timezone = "America/Los_Angeles"
	p := sentinelFixtureP(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["proxy_url"] != proxyURL || body["timezone"] != timezone {
			t.Fatalf("solver context = %#v", body)
		}
		json.NewEncoder(w).Encode(sentinelContext{
			ID: "account-context", P: p, UserAgent: browserUserAgent,
			Language: "en-US", Timezone: timezone, Offset: 420,
			ProxyHash: service.ProxyURLHash(proxyURL),
		})
	}))
	defer server.Close()
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_URL", server.URL)
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_KEY", strings.Repeat("k", 32))
	lookup := sentinelAccountLookup{"selected": {"proxy_url": proxyURL, "proxy_timezone": timezone}}
	client := NewClient("selected", lookup, nil)
	if err := client.prepareSentinelContext(context.Background()); err != nil {
		t.Fatal(err)
	}
	if client.proxyURL != proxyURL || client.sentinel.Timezone != timezone {
		t.Fatalf("client egress mismatch: proxy=%q timezone=%q", client.proxyURL, client.sentinel.Timezone)
	}
}

func TestSentinelProofUsesCurrentAlgorithm(t *testing.T) {
	token, err := buildProofToken(context.Background(), "fixture-seed", "00f", sentinelFixtureP(t))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(token, "~S") {
		t.Fatal("proof missing current suffix")
	}
	encoded := strings.TrimSuffix(strings.TrimPrefix(token, "gAAAAAB"), "~S")
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatal(err)
	}
	var fields []any
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	if len(fields) != 25 {
		t.Fatalf("fields=%d, want 25", len(fields))
	}
	digest := fmt.Sprintf("%08x", fnv1aAvalanche("fixture-seed"+encoded))
	if digest[:3] > "00f" {
		t.Fatal("proof does not meet difficulty")
	}
	for input, want := range map[string]uint32{"": 0xab3e7c0b, "a": 0x1a80b1b3, "fixture-seed": 0x037fd185, "汉😀": 0x34ea4a66} {
		if got := fnv1aAvalanche(input); got != want {
			t.Errorf("FNV vector %q: %x != %x", input, got, want)
		}
	}
	for _, diff := range []string{"", "not-hex", "123456789", "FF"} {
		if _, err := buildProofToken(context.Background(), "s", diff, sentinelFixtureP(t)); err == nil {
			t.Errorf("accepted invalid difficulty %q", diff)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := buildProofToken(ctx, "s", "0", sentinelFixtureP(t)); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation: %v", err)
	}
}

func TestSentinelPrepareFinalizeContract(t *testing.T) {
	for _, challenge := range []bool{false, true} {
		t.Run(fmt.Sprint(challenge), func(t *testing.T) {
			p := sentinelFixtureSolver(t)
			var paths []string
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				paths = append(paths, r.URL.Path)
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				switch r.URL.Path {
				case "/backend-api/sentinel/chat-requirements/prepare":
					if body["p"] != p {
						t.Error("requirements p changed")
					}
					json.NewEncoder(w).Encode(map[string]any{"prepare_token": "prepare-fixture", "proofofwork": map[string]any{"required": challenge, "seed": "s", "difficulty": "f"}, "turnstile": map[string]any{"required": challenge, "dx": "dx-fixture"}})
				case "/backend-api/sentinel/chat-requirements/finalize":
					if len(body) != 3 || body["prepare_token"] != "prepare-fixture" {
						t.Error("invalid finalize contract")
					}
					for _, key := range []string{"proofofwork", "turnstile"} {
						value, ok := body[key].(string)
						if !ok || challenge && value == "" || !challenge && value != "" {
							t.Errorf("invalid %s", key)
						}
					}
					json.NewEncoder(w).Encode(map[string]string{"token": "final-fixture"})
				default:
					http.NotFound(w, r)
				}
			}))
			defer upstream.Close()
			client := NewClient("test-account", nil, nil)
			client.BaseURL = upstream.URL
			jar, err := cookiejar.New(nil)
			if err != nil {
				t.Fatal(err)
			}
			upstreamURL, err := url.Parse(upstream.URL)
			if err != nil {
				t.Fatal(err)
			}
			jar.SetCookies(upstreamURL, []*http.Cookie{{Name: "oai-sc", Value: "restricted", Path: "/"}, {Name: "keep", Value: "value", Path: "/"}})
			client.httpClient = &http.Client{Jar: jar}
			client.sentinel = &sentinelContext{ID: "fixture", P: p, UserAgent: browserUserAgent, Language: "en-US", Timezone: "Asia/Tokyo", Offset: -540}
			reqs, err := client.getChatRequirements(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if reqs.Token != "final-fixture" || len(paths) != 2 {
				t.Fatalf("unexpected handshake: paths=%v", paths)
			}
			if zone, offset := client.imageTimezone(); zone != "Asia/Tokyo" || offset != -540 {
				t.Fatal("browser timezone not used")
			}
			cookies := map[string]string{}
			for _, cookie := range jar.Cookies(upstreamURL) {
				cookies[cookie.Name] = cookie.Value
			}
			if _, ok := cookies["oai-sc"]; ok || cookies["keep"] != "value" {
				t.Fatalf("restricted cookie cleanup = %#v", cookies)
			}
		})
	}
}

func TestSentinelRejectsMissingPrepareWithoutFinalize(t *testing.T) {
	sentinelFixtureSolver(t)
	count := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		json.NewEncoder(w).Encode(map[string]string{"token": "legacy-only"})
	}))
	defer upstream.Close()
	client := NewClient("test-account", nil, nil)
	client.BaseURL = upstream.URL
	if _, err := client.getChatRequirements(context.Background()); err == nil {
		t.Fatal("accepted old response")
	}
	if count != 1 {
		t.Fatalf("must not finalize missing prepare, got %d", count)
	}
}

func TestSentinelSolverRejectsRedirectAndMissingConfiguration(t *testing.T) {
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_URL", "")
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_KEY", "")
	if err := callSentinelSolver(context.Background(), "/v1/context", struct{}{}, &sentinelContext{}); err == nil {
		t.Fatal("missing config accepted")
	}
	hit := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hit = true }))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 307) }))
	defer redirect.Close()
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_URL", redirect.URL)
	t.Setenv("CHATGPT2API_SENTINEL_SOLVER_KEY", strings.Repeat("k", 32))
	err := callSentinelSolver(context.Background(), "/v1/context", struct{}{}, &sentinelContext{})
	if err == nil || hit {
		t.Fatal("solver redirect followed or accepted")
	}
}

func TestSentinelPreservesProofBrowserFields(t *testing.T) {
	original := sentinelFixtureP(t)
	token, err := buildProofToken(context.Background(), "seed", "f", original)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := decodeRequirementsConfig(original)
	after, _ := decodeRequirementsConfig("gAAAAAC" + strings.TrimSuffix(strings.TrimPrefix(token, "gAAAAAB"), "~S"))
	for i := range before {
		if i != 3 && i != 9 && !reflect.DeepEqual(before[i], after[i]) {
			t.Fatalf("browser field %d changed", i)
		}
	}
}
