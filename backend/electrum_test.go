package main

import (
	"bufio"
	"context"
	"encoding/json"
	"net"
	"strings"
	"testing"
	"time"
)

func TestElectrumChecksGenesisAndIDs(t *testing.T) {
	for _, tc := range []struct {
		name, genesis string
		id            int
		ok            bool
	}{{"mainnet", mainnetGenesis, 2, true}, {"testnet", strings.Repeat("0", 64), 2, false}, {"mismatched ID", mainnetGenesis, 9, false}} {
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
			err = (Electrum{Address: ln.Addr().String()}).Call(context.Background(), "blockchain.headers.subscribe", []any{}, &tip)
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
