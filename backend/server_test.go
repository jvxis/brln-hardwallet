package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeRPC struct {
	calls []string
	fail  bool
}

func (f *fakeRPC) Call(_ context.Context, method string, _ []any, out any) error {
	f.calls = append(f.calls, method)
	if f.fail {
		return errors.New("secret upstream diagnostic")
	}
	values := map[string]string{"blockchain.headers.subscribe": `{"height":100}`, "blockchain.relayfee": `0.00001`, "blockchain.estimatefee": `0.000023`, "blockchain.transaction.broadcast": `"` + strings.Repeat("a", 64) + `"`}
	return json.Unmarshal([]byte(values[method]), out)
}
func request(a http.Handler, method, path, body, origin, token string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "https://node:4449"+path, strings.NewReader(body))
	r.Header.Set("X-BRLN-Proxy-Token", token)
	r.Header.Set("Origin", origin)
	r.Header.Set("X-BRLN-Request", "1")
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	return w
}
func TestAuthorizationAndCSRF(t *testing.T) {
	f := &fakeRPC{}
	a := NewApp(f, "private-proxy-token", http.NotFoundHandler())
	for _, tc := range []struct {
		method, path, origin, token string
		status                      int
	}{
		{"GET", "/healthz", "", "", 200}, {"GET", "/api/v1/status", "", "", 401}, {"GET", "/", "", "wrong", 401},
		{"GET", "/api/v1/status", "", "private-proxy-token", 200},
		{"POST", "/api/v1/broadcast", "https://evil.test", "private-proxy-token", 403},
		{"POST", "/api/v1/broadcast", "http://node:4449", "private-proxy-token", 403},
		{"POST", "/api/v1/broadcast", "https://node:4449/path", "private-proxy-token", 403},
		{"POST", "/api/v1/broadcast", "", "private-proxy-token", 403},
		{"PUT", "/api/v1/broadcast", "https://node:4449", "private-proxy-token", 405},
	} {
		w := request(a, tc.method, tc.path, "{}", tc.origin, tc.token)
		if w.Code != tc.status {
			t.Errorf("%+v: %d %s", tc, w.Code, w.Body.String())
		}
	}
	if len(f.calls) != 1 {
		t.Fatalf("rejected requests reached RPC: %v", f.calls)
	}
}
func TestBroadcastAndClosedAPI(t *testing.T) {
	f := &fakeRPC{}
	a := NewApp(f, "token", http.NotFoundHandler())
	for _, body := range []string{`{"hex":"zz"}`, `{"hex":"00000000000000000000","seed":"anything"}`, `{"hex":"00000000000000000000"}{}`, strings.Repeat("x", (1<<20)+1)} {
		if w := request(a, "POST", "/api/v1/broadcast", body, "https://node:4449", "token"); w.Code != 400 {
			t.Fatal(w.Code)
		}
	}
	for _, path := range []string{"/api/v1/script/nothex", "/api/v1/transaction/nothex", "/api/v1/rpc", "/api/v1/seed"} {
		w := request(a, "GET", path, "", "", "token")
		if w.Code != 400 && w.Code != 404 {
			t.Fatal(w.Code)
		}
	}
	if len(f.calls) > 0 {
		t.Fatal(f.calls)
	}
	w := request(a, "POST", "/api/v1/broadcast", `{"hex":"00000000000000000000"}`, "https://node:4449", "token")
	if w.Code != 200 || len(f.calls) != 1 {
		t.Fatal(w.Code, f.calls)
	}
}
func TestFeesAndFailureRedaction(t *testing.T) {
	f := &fakeRPC{}
	a := NewApp(f, "token", http.NotFoundHandler())
	w := request(a, "GET", "/api/v1/fees", "", "", "token")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"sat_per_vbyte":3`) {
		t.Fatal(w.Body.String())
	}
	f.fail = true
	w = request(a, "GET", "/api/v1/status", "", "", "token")
	if w.Code != 503 || strings.Contains(w.Body.String(), "secret") {
		t.Fatal(w.Body.String())
	}
}
