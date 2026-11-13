package backend

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func (c *Client) getChatRequirements(ctx context.Context) (ChatRequirements, error) {
	c.syncClearanceFingerprint()
	if c.sentinel == nil {
		if err := c.prepareSentinelContext(ctx); err != nil {
			return ChatRequirements{}, err
		}
	} else if strings.HasPrefix(c.sentinel.ID, "native-") {
		if err := c.buildNativeSentinelContext(); err != nil {
			return ChatRequirements{}, err
		}
	}
	base := "/backend-anon/sentinel/chat-requirements"
	if c.AccessToken != "" {
		base = "/backend-api/sentinel/chat-requirements"
	}
	prepare, err := c.sentinelRequest(ctx, base+"/prepare", map[string]any{"p": c.sentinel.P})
	if err != nil {
		return ChatRequirements{}, err
	}
	prepareToken := util.Clean(prepare["prepare_token"])
	if prepareToken == "" {
		return ChatRequirements{}, fmt.Errorf("missing sentinel prepare token")
	}
	if util.ToBool(util.StringMap(prepare["arkose"])["required"]) {
		return ChatRequirements{}, fmt.Errorf("chat requirements requires unsupported arkose challenge")
	}
	reqs := ChatRequirements{}
	proof := util.StringMap(prepare["proofofwork"])
	if util.ToBool(proof["required"]) {
		seed := util.Clean(proof["seed"])
		difficulty := util.Clean(proof["difficulty"])
		if len(difficulty) > 8 {
			reqs.ProofToken, err = buildSHA3ProofToken(ctx, seed, difficulty, c.sentinel.P)
		} else {
			reqs.ProofToken, err = buildProofToken(ctx, seed, difficulty, c.sentinel.P)
		}
		if err != nil {
			return ChatRequirements{}, err
		}
	}
	turnstile := util.StringMap(prepare["turnstile"])
	if util.ToBool(turnstile["required"]) {
		dx := util.Clean(turnstile["dx"])
		if dx == "" {
			return ChatRequirements{}, fmt.Errorf("missing sentinel turnstile challenge")
		}
		token, err := c.solveTurnstileChallenge(ctx, dx, prepare)
		if err != nil {
			return ChatRequirements{}, err
		}
		if token == "" {
			return ChatRequirements{}, fmt.Errorf("empty sentinel turnstile result")
		}
		reqs.TurnstileToken = token
	}
	finalized, err := c.sentinelRequest(ctx, base+"/finalize", map[string]any{
		"prepare_token": prepareToken, "proofofwork": reqs.ProofToken, "turnstile": reqs.TurnstileToken,
	})
	if err != nil {
		return ChatRequirements{}, err
	}
	c.dropRestrictedSentinelCookie()
	reqs.Token = util.Clean(finalized["token"])
	if reqs.Token == "" {
		return ChatRequirements{}, fmt.Errorf("missing finalized sentinel token")
	}
	reqs.SOToken, reqs.Raw = util.Clean(finalized["so_token"]), finalized
	return reqs, nil
}

func (c *Client) solveTurnstileChallenge(ctx context.Context, dx string, prepare map[string]any) (string, error) {
	if sentinelSolverMode() == "external" {
		var solved struct {
			Token string `json:"token"`
		}
		err := callSentinelSolver(ctx, "/v1/turnstile", map[string]any{
			"context_id": c.sentinel.ID, "p": c.sentinel.P, "dx": dx, "requirements": prepare,
		}, &solved)
		if err == nil && solved.Token != "" {
			return solved.Token, nil
		}
		if token, vmErr := solveTurnstileToken(dx, c.sentinel.P); vmErr == nil && token != "" {
			return token, nil
		}
		if err != nil {
			return "", err
		}
		return "", fmt.Errorf("empty sentinel turnstile result")
	}

	// Default native mode: solve Turnstile bytecode directly in-process (<1ms).
	if token, vmErr := solveTurnstileToken(dx, c.sentinel.P); vmErr == nil && token != "" {
		return token, nil
	} else if isExternalSentinelSolverConfigured() {
		var solved struct {
			Token string `json:"token"`
		}
		err := callSentinelSolver(ctx, "/v1/turnstile", map[string]any{
			"context_id": c.sentinel.ID, "p": c.sentinel.P, "dx": dx, "requirements": prepare,
		}, &solved)
		if err == nil && solved.Token != "" {
			return solved.Token, nil
		}
		if err != nil {
			return "", err
		}
		return "", vmErr
	} else {
		return "", vmErr
	}
}

func (c *Client) dropRestrictedSentinelCookie() {
	if c == nil || c.httpClient == nil || c.httpClient.Jar == nil {
		return
	}
	base, err := url.Parse(c.BaseURL)
	if err != nil || base.Host == "" {
		return
	}
	c.httpClient.Jar.SetCookies(base, []*http.Cookie{{
		Name: "oai-sc", Value: "", Path: "/", MaxAge: -1, Expires: time.Unix(1, 0),
	}})
}

func (c *Client) sentinelRequest(ctx context.Context, path string, body any) (map[string]any, error) {
	response, err := c.postJSON(ctx, path, body, c.headersContext(ctx, path, map[string]string{"Content-Type": "application/json"}), false)
	if err != nil {
		return nil, err
	}
	return readJSONResponse(response, path)
}
