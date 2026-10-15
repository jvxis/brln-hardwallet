package main

import (
	"context"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type RPC interface {
	Call(context.Context, string, []any, any) error
}
type App struct {
	RPC    RPC
	Token  string
	Source string
	Static http.Handler
	slots  chan struct{}
}

func NewApp(rpc RPC, token string, static http.Handler) *App {
	return &App{RPC: rpc, Token: token, Static: static, slots: make(chan struct{}, 4)}
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}
func validHex(s string, size int) bool {
	if len(s) != size {
		return false
	}
	_, err := hex.DecodeString(s)
	return err == nil
}

// Only the Manager on this same node may embed the authenticated wallet.
// Reject malformed hosts rather than reflecting arbitrary CSP directives.
func managerFrameAncestor(hostport string) string {
	host, port, err := net.SplitHostPort(hostport)
	if err != nil || port != "4449" || (net.ParseIP(host) == nil && !regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9.-]*$`).MatchString(host)) {
		return "'none'"
	}
	return "https://" + net.JoinHostPort(host, "8443")
}

func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Permissions-Policy", "serial=(self)")
	// The Svelte build emits script hashes in its CSP meta tag. This independent
	// header supplies frame-ancestors, which cannot be enforced by a meta tag.
	w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'")
	if r.URL.Path == "/healthz" && r.Method == http.MethodGet {
		writeJSON(w, 200, map[string]string{"status": "ok", "version": "0.1.0-dev"})
		return
	}
	if a.Token == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-BRLN-Proxy-Token")), []byte(a.Token)) != 1 {
		fail(w, 401, "authentication_required")
		return
	}
	w.Header().Set("Content-Security-Policy", "frame-ancestors "+managerFrameAncestor(r.Host)+"; object-src 'none'; base-uri 'self'")
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		fail(w, 405, "method_not_allowed")
		return
	}
	if r.Method == http.MethodPost {
		origin, err := url.Parse(r.Header.Get("Origin"))
		if err != nil || origin.Scheme != "https" || origin.Host != r.Host || origin.Path != "" || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || r.Header.Get("X-BRLN-Request") != "1" {
			fail(w, 403, "invalid_origin")
			return
		}
	}
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		if r.Method != http.MethodGet {
			fail(w, 405, "method_not_allowed")
			return
		}
		a.Static.ServeHTTP(w, r)
		return
	}
	select {
	case a.slots <- struct{}{}:
		defer func() { <-a.slots }()
	default:
		fail(w, 429, "busy")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
	defer cancel()
	if err := a.api(ctx, w, r); err != nil {
		fail(w, 503, "electrum_unavailable")
	}
}

func (a *App) api(ctx context.Context, w http.ResponseWriter, r *http.Request) error {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/")
	if r.Method == http.MethodGet {
		switch path {
		case "status":
			var tip struct {
				Height int `json:"height"`
			}
			if err := a.RPC.Call(ctx, "blockchain.headers.subscribe", []any{}, &tip); err != nil {
				return err
			}
			writeJSON(w, 200, map[string]any{"version": "0.1.0-dev", "protocol": "brln-2", "network": "mainnet", "height": tip.Height, "experimental": true, "electrum_source": a.Source})
			return nil
		case "fees":
			var relay float64
			if err := a.RPC.Call(ctx, "blockchain.relayfee", []any{}, &relay); err != nil {
				return err
			}
			var estimate float64
			if err := a.RPC.Call(ctx, "blockchain.estimatefee", []any{6}, &estimate); err != nil {
				return err
			}
			if estimate <= 0 || math.IsNaN(estimate) || math.IsInf(estimate, 0) || relay < 0 {
				fail(w, 503, "fee_estimate_unavailable")
				return nil
			}
			writeJSON(w, 200, map[string]float64{"sat_per_vbyte": math.Max(1, math.Ceil(estimate*1e5)), "minimum_sat_per_vbyte": math.Max(1, math.Ceil(relay*1e5))})
			return nil
		}
		if strings.HasPrefix(path, "script/") {
			hash := strings.TrimPrefix(path, "script/")
			if !validHex(hash, 64) {
				fail(w, 400, "invalid_script_hash")
				return nil
			}
			var history []struct {
				TxID   string `json:"tx_hash"`
				Height int    `json:"height"`
			}
			var balance struct {
				Confirmed   int64 `json:"confirmed"`
				Unconfirmed int64 `json:"unconfirmed"`
			}
			var utxos []struct {
				TxID   string `json:"tx_hash"`
				Index  uint32 `json:"tx_pos"`
				Value  int64  `json:"value"`
				Height int    `json:"height"`
			}
			if err := a.RPC.Call(ctx, "blockchain.scripthash.get_history", []any{hash}, &history); err != nil {
				return err
			}
			if len(history) > 2000 {
				fail(w, 422, "history_limit_exceeded")
				return nil
			}
			if err := a.RPC.Call(ctx, "blockchain.scripthash.get_balance", []any{hash}, &balance); err != nil {
				return err
			}
			if err := a.RPC.Call(ctx, "blockchain.scripthash.listunspent", []any{hash}, &utxos); err != nil {
				return err
			}
			if len(utxos) > 2000 {
				fail(w, 422, "utxo_limit_exceeded")
				return nil
			}
			writeJSON(w, 200, map[string]any{"history": history, "balance": balance, "utxos": utxos})
			return nil
		}
		if strings.HasPrefix(path, "transaction/") {
			txid := strings.TrimPrefix(path, "transaction/")
			if !validHex(txid, 64) {
				fail(w, 400, "invalid_txid")
				return nil
			}
			var raw string
			if err := a.RPC.Call(ctx, "blockchain.transaction.get", []any{txid, false}, &raw); err != nil {
				return err
			}
			if len(raw) > 1<<20 || len(raw)%2 != 0 || !validHex(raw, len(raw)) {
				return errors.New("invalid transaction")
			}
			writeJSON(w, 200, map[string]string{"hex": raw})
			return nil
		}
	}
	if path == "broadcast" && r.Method == http.MethodPost {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		var request struct {
			Hex string `json:"hex"`
		}
		if dec.Decode(&request) != nil || dec.Decode(new(any)) != io.EOF || len(request.Hex) < 20 || len(request.Hex)%2 != 0 || !validHex(request.Hex, len(request.Hex)) {
			fail(w, 400, "invalid_transaction")
			return nil
		}
		var txid string
		if err := a.RPC.Call(ctx, "blockchain.transaction.broadcast", []any{request.Hex}, &txid); err != nil {
			return err
		}
		if !validHex(txid, 64) {
			return errors.New("invalid broadcast result")
		}
		writeJSON(w, 200, map[string]string{"txid": txid})
		return nil
	}
	fail(w, 404, "not_found")
	return nil
}
