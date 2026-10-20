package backend

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"chatgpt2api/internal/util"
)

func (c *Client) getChatRequirements(ctx context.Context) (ChatRequirements, error) {
	if c.sentinel == nil {
		if err := c.prepareSentinelContext(ctx); err != nil {
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
		reqs.ProofToken, err = buildProofToken(ctx, util.Clean(proof["seed"]), util.Clean(proof["difficulty"]), c.sentinel.P)
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
		var solved struct {
			Token string `json:"token"`
		}
		err := callSentinelSolver(ctx, "/v1/turnstile", map[string]any{
			"context_id": c.sentinel.ID, "p": c.sentinel.P, "dx": dx, "requirements": prepare,
		}, &solved)
		if err != nil {
			return ChatRequirements{}, err
		}
		if solved.Token == "" {
			return ChatRequirements{}, fmt.Errorf("empty sentinel turnstile result")
		}
		reqs.TurnstileToken = solved.Token
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
