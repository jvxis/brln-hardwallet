package main

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestElectrumChecksGenesisAndIDs(t *testing.T) {
	for _, tc := range []struct {
		name, genesis, transport string
		id                       int
		ok                       bool
	}{{"mainnet", mainnetGenesis, "", 2, true}, {"local", mainnetGenesis, "local", 2, true}, {"public TCP", mainnetGenesis, "tcp", 2, true}, {"testnet", strings.Repeat("0", 64), "", 2, false}, {"public TCP wrong network", strings.Repeat("0", 64), "tcp", 2, false}, {"mismatched ID", mainnetGenesis, "", 9, false}} {
		t.Run(tc.name, func(t *testing.T) {
			ln, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			defer ln.Close()
			done := make(chan struct{})
			go func() {
				defer close(done)
				c, e := ln.Accept()
				if e != nil {
					return
				}
				defer c.Close()
				c.SetDeadline(time.Now().Add(2 * time.Second))
				s := bufio.NewScanner(c)
				enc := json.NewEncoder(c)
				if !s.Scan() {
					return
				}
				enc.Encode(map[string]any{"id": 1, "result": map[string]string{"genesis_hash": tc.genesis}})
				if !s.Scan() {
					return
				}
				enc.Encode(map[string]any{"id": tc.id, "result": map[string]int{"height": 123}})
			}()
			var tip struct{ Height int }
			err = (Electrum{Address: ln.Addr().String(), Transport: tc.transport}).Call(context.Background(), "blockchain.headers.subscribe", []any{}, &tip)
			if (err == nil) != tc.ok {
				t.Fatal(err)
			}
			if tc.ok && tip.Height != 123 {
				t.Fatal(tip)
			}
			<-done
		})
	}
}
func TestRejectsArbitraryMethodBeforeDial(t *testing.T) {
	if err := (Electrum{Address: "invalid"}).Call(context.Background(), "wallet.importprivkey", nil, new(any)); err == nil || err.Error() != "electrum method not allowed" {
		t.Fatal(err)
	}
}

func TestElectrumTLSRejectsUntrustedCertificateWithoutTCPFallback(t *testing.T) {
	var connections atomic.Int32
	server := httptest.NewUnstartedServer(http.NotFoundHandler())
	server.Config.ErrorLog = log.New(io.Discard, "", 0)
	server.Config.ConnState = func(_ net.Conn, state http.ConnState) {
		if state == http.StateNew {
			connections.Add(1)
		}
	}
	server.StartTLS()
	defer server.Close()
	err := (Electrum{Address: server.Listener.Addr().String(), Transport: "tls"}).Call(context.Background(), "server.features", nil, new(any))
	if err == nil || err.Error() != "electrum unavailable" || connections.Load() != 1 {
		t.Fatalf("TLS must fail closed without retry/downgrade: %v, connections=%d", err, connections.Load())
	}
}

// Pipelined replies may arrive out of order and interleaved with notifications.
func TestElectrumPipelinesOnOneConnection(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	var accepted atomic.Int32
	go func() {
		for {
			c, e := ln.Accept()
			if e != nil {
				return
			}
			accepted.Add(1)
			go func() {
				defer c.Close()
				c.SetDeadline(time.Now().Add(2 * time.Second))
				s := bufio.NewScanner(c)
				enc := json.NewEncoder(c)
				if !s.Scan() {
					return
				}
				enc.Encode(map[string]any{"id": 1, "result": map[string]string{"genesis_hash": mainnetGenesis}})
				var ids []int
				for len(ids) < 3 && s.Scan() {
					var call struct{ ID int }
					json.Unmarshal(s.Bytes(), &call)
					ids = append(ids, call.ID)
				}
				enc.Encode(map[string]any{"method": "blockchain.headers.subscribe", "params": []any{}})
				for i := len(ids) - 1; i >= 0; i-- {
					enc.Encode(map[string]any{"id": ids[i], "result": ids[i] * 10})
				}
			}()
		}
	}()
	var a, b, c int
	e := Electrum{Address: ln.Addr().String()}
	if err := e.Do(context.Background(), Request{"blockchain.relayfee", nil, &a}, Request{"blockchain.estimatefee", []any{6}, &b}, Request{"blockchain.relayfee", nil, &c}); err != nil {
		t.Fatal(err)
	}
	if a != 20 || b != 30 || c != 40 || accepted.Load() != 1 {
		t.Fatal(a, b, c, accepted.Load())
	}
	if err := e.Do(context.Background(), Request{"blockchain.relayfee", nil, &a}, Request{"wallet.dump", nil, &b}); err == nil || err.Error() != "electrum method not allowed" || accepted.Load() != 1 {
		t.Fatal("a disallowed method must reject the whole batch before dialing", err)
	}
}
