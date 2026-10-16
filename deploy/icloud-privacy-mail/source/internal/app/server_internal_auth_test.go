package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInternalRequestRequiresSharedToken(t *testing.T) {
	internalToken := strings.Repeat("i", 32)
	t.Setenv("INTERNAL_SERVICE_TOKEN", internalToken)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/runtime/export", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	server := &Server{store: &FileStore{}, mux: mux}

	tests := []struct {
		name  string
		token string
		want  int
	}{
		{name: "missing token", want: http.StatusUnauthorized},
		{name: "wrong token", token: strings.Repeat("x", 32), want: http.StatusUnauthorized},
		{name: "matching token", token: internalToken, want: http.StatusNoContent},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/api/runtime/export", nil)
			request.Header.Set("X-ChatGPT2API-Internal", "icloud-privacy-mail")
			if test.token != "" {
				request.Header.Set("X-Internal-Token", test.token)
			}
			recorder := httptest.NewRecorder()
			server.ServeHTTP(recorder, request)
			if recorder.Code != test.want {
				t.Fatalf("status = %d body = %s, want %d", recorder.Code, recorder.Body.String(), test.want)
			}
		})
	}
}
