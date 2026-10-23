package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeRPC struct {
	calls   []string
	batches int
	fail    bool
}

func TestEmbeddedWalletRestrictedToManager(t *testing.T) {
	for host, want := range map[string]string{
		"192.168.68.92:4449": "https://192.168.68.92:8443",
		"node.example:4449":  "https://node.example:8443",
		"[::1]:4449":         "https://[::1]:8443",
		"node:443":           "'none'", "node": "'none'",
		"evil;frame-ancestors *:4449": "'none'", "user@node:4449": "'none'",
	} {
		if got := managerFrameAncestor(host); got != want {
			t.Fatalf("%q: got %q want %q", host, got, want)
		}
	}
	a := NewApp(&fakeRPC{}, "token", http.NotFoundHandler())
	w := request(a, "GET", "/", "", "", "token")
	if got := w.Header().Get("Content-Security-Policy"); got != "frame-ancestors https://node:8443; object-src 'none'; base-uri 'self'" {
		t.Fatal(got)
	}
	w = request(a, "GET", "/", "", "", "")
	if !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatal("unauthenticated embedding allowed")
	}
}

func (f *fakeRPC) Do(_ context.Context, requests ...Request) error {
	f.batches++
	for _, r := range requests {
		f.calls = append(f.calls, r.Method)
	}
	if f.fail {
		return errors.New("secret upstream diagnostic")
	}
	values := map[string]string{"blockchain.headers.subscribe": `{"height":100}`, "blockchain.relayfee": `0.00001`, "blockchain.estimatefee": `0.000023`, "blockchain.transaction.broadcast": `"` + strings.Repeat("a", 64) + `"`,
		"blockchain.scripthash.get_history": `[{"tx_hash":"` + strings.Repeat("b", 64) + `","height":7}]`, "blockchain.scripthash.get_balance": `{"confirmed":5,"unconfirmed":0}`, "blockchain.scripthash.listunspent": `[]`}
	for _, r := range requests {
		if err := json.Unmarshal([]byte(values[r.Method]), r.Result); err != nil {
			return err
		}
	}
	return nil
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

func TestScriptBatchUsesOneConnection(t *testing.T) {
	f := &fakeRPC{}
	a := NewApp(f, "token", http.NotFoundHandler())
	hashes := make([]string, maxScriptBatch)
	for i := range hashes {
		hashes[i] = fmt.Sprintf("%064x", i)
	}
	body, _ := json.Marshal(map[string]any{"hashes": hashes})
	w := request(a, "POST", "/api/v1/scripts", string(body), "https://node:4449", "token")
	var result struct {
		Scripts []struct {
			History []struct {
				TxID string `json:"tx_hash"`
			} `json:"history"`
			Balance struct{ Confirmed int64 } `json:"balance"`
		} `json:"scripts"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || len(result.Scripts) != maxScriptBatch || result.Scripts[19].Balance.Confirmed != 5 || len(result.Scripts[0].History) != 1 {
		t.Fatal(w.Code, w.Body.String())
	}
	if f.batches != 1 || len(f.calls) != 3*maxScriptBatch {
		t.Fatalf("expected one Electrum connection for the batch: batches=%d calls=%d", f.batches, len(f.calls))
	}
	w = request(a, "GET", "/api/v1/script/"+hashes[0], "", "", "token")
	if w.Code != 200 || f.batches != 2 {
		t.Fatal(w.Code, f.batches)
	}
	for _, bad := range []string{`{"hashes":[]}`, `{"hashes":["` + hashes[0] + `","` + hashes[0] + `"]}`, `{"hashes":["zz"]}`, `{"hashes":["` + hashes[0] + `"],"x":1}`, string(must(json.Marshal(map[string]any{"hashes": append(hashes, fmt.Sprintf("%064x", 99))})))} {
		if w := request(a, "POST", "/api/v1/scripts", bad, "https://node:4449", "token"); w.Code != 400 {
			t.Fatal(bad, w.Code)
		}
	}
	if w := request(a, "POST", "/api/v1/scripts", string(body), "https://evil.test", "token"); w.Code != 403 {
		t.Fatal(w.Code)
	}
	if f.batches != 2 {
		t.Fatal("rejected batches reached Electrum")
	}
}

func must(b []byte, err error) []byte {
	if err != nil {
		panic(err)
	}
	return b
}
