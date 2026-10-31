package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAnnouncementRealtimeBroadcastAndSSE(t *testing.T) {
	app := newTestApp(t)
	authHeader := adminAuthHeader(t, app)

	srv := httptest.NewServer(app.Handler())
	defer srv.Close()

	sseCtx, sseCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer sseCancel()

	sseReq, err := http.NewRequestWithContext(sseCtx, http.MethodGet, srv.URL+"/api/announcements/events?target=image", nil)
	if err != nil {
		t.Fatalf("new sse request: %v", err)
	}
	sseResp, err := http.DefaultClient.Do(sseReq)
	if err != nil {
		t.Fatalf("open sse: %v", err)
	}
	defer sseResp.Body.Close()

	if ct := sseResp.Header.Get("Content-Type"); !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("unexpected content-type = %q", ct)
	}

	events := make(chan map[string]any, 8)
	go func() {
		scanner := bufio.NewScanner(sseResp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			var payload map[string]any
			if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &payload); err == nil {
				events <- payload
			}
		}
	}()

	waitEvent := func(label string) map[string]any {
		t.Helper()
		select {
		case ev := <-events:
			return ev
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for SSE event (%s)", label)
			return nil
		}
	}

	initial := waitEvent("initial snapshot")
	if items := logItems(initial); len(items) != 0 {
		t.Fatalf("expected 0 initial SSE items, got %#v", initial)
	}

	// 1. Create announcement with broadcast_now: true -> sets last_broadcast_at & pushes via SSE immediately
	createReq := httptest.NewRequest(
		http.MethodPost,
		"/api/admin/announcements",
		strings.NewReader(`{"title":"紧急通知","content":"线路升级已完成","show_login":false,"show_image":true,"broadcast_now":true}`),
	)
	createReq.Header.Set("Authorization", authHeader)
	createRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(createRes, createReq)
	if createRes.Code != http.StatusOK {
		t.Fatalf("create broadcast announcement status = %d body = %s", createRes.Code, createRes.Body.String())
	}

	pushed1 := waitEvent("after create")
	items1 := logItems(pushed1)
	if len(items1) != 1 {
		t.Fatalf("expected 1 pushed item, got %#v", pushed1)
	}
	annID, _ := items1[0]["id"].(string)
	if annID == "" {
		t.Fatalf("missing announcement id in SSE item: %#v", items1[0])
	}
	if v, _ := items1[0]["popup_version"].(float64); int(v) != 1 {
		t.Fatalf("expected popup_version = 1, got %#v", items1[0])
	}
	firstBroadcastAt, _ := items1[0]["last_broadcast_at"].(string)
	if firstBroadcastAt == "" {
		t.Fatalf("expected non-empty last_broadcast_at when broadcast_now=true: %#v", items1[0])
	}

	// 2. Explicit re-broadcast endpoint increments popup_version to 2 and pushes SSE immediately
	broadcastReq := httptest.NewRequest(http.MethodPost, "/api/admin/announcements/"+annID+"/broadcast", nil)
	broadcastReq.Header.Set("Authorization", authHeader)
	broadcastRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(broadcastRes, broadcastReq)
	if broadcastRes.Code != http.StatusOK {
		t.Fatalf("broadcast status = %d body = %s", broadcastRes.Code, broadcastRes.Body.String())
	}

	pushed2 := waitEvent("after explicit broadcast")
	items2 := logItems(pushed2)
	if len(items2) != 1 {
		t.Fatalf("expected 1 pushed item after broadcast, got %#v", pushed2)
	}
	if v, _ := items2[0]["popup_version"].(float64); int(v) != 2 {
		t.Fatalf("expected popup_version = 2 after broadcast, got %#v", items2[0])
	}

	// 3. Disabling announcement and attempting broadcast returns 400
	disableReq := httptest.NewRequest(
		http.MethodPost,
		"/api/admin/announcements/"+annID,
		strings.NewReader(`{"enabled":false}`),
	)
	disableReq.Header.Set("Authorization", authHeader)
	disableRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(disableRes, disableReq)
	if disableRes.Code != http.StatusOK {
		t.Fatalf("disable status = %d body = %s", disableRes.Code, disableRes.Body.String())
	}
	_ = waitEvent("after disable")

	failBroadcastReq := httptest.NewRequest(http.MethodPost, "/api/admin/announcements/"+annID+"/broadcast", nil)
	failBroadcastReq.Header.Set("Authorization", authHeader)
	failBroadcastRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(failBroadcastRes, failBroadcastReq)
	if failBroadcastRes.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when broadcasting disabled announcement, got %d body = %s", failBroadcastRes.Code, failBroadcastRes.Body.String())
	}
}
