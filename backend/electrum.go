package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"time"
)

const mainnetGenesis = "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f"

// One batched script query is three calls per script hash.
const maxPipelinedRequests = 3 * maxScriptBatch

// The destination comes only from operator configuration, never an HTTP request.
type Electrum struct {
	Address   string
	Genesis   string
	Transport string
}
type rpcReply struct {
	ID     int             `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  json.RawMessage `json:"error"`
}

// Request is one Electrum method call; Result receives the decoded result.
type Request struct {
	Method string
	Params []any
	Result any
}

func (e Electrum) Call(ctx context.Context, method string, params []any, result any) error {
	return e.Do(ctx, Request{method, params, result})
}

// Do runs the requests on one connection: the genesis is checked once, then
// the requests are pipelined and matched to their replies by ID.
func (e Electrum) Do(ctx context.Context, requests ...Request) error {
	if len(requests) == 0 || len(requests) > maxPipelinedRequests {
		return errors.New("invalid electrum batch")
	}
	for _, request := range requests {
		switch request.Method {
		case "server.features", "blockchain.headers.subscribe", "blockchain.scripthash.get_history", "blockchain.scripthash.get_balance", "blockchain.scripthash.listunspent", "blockchain.transaction.get", "blockchain.estimatefee", "blockchain.relayfee", "blockchain.transaction.broadcast":
		default:
			return errors.New("electrum method not allowed")
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	address := e.Address
	if e.Transport == "tailscale" {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return errors.New("invalid tailnet endpoint")
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil || len(ips) == 0 {
			return errors.New("tailnet endpoint unavailable")
		}
		_, block, _ := net.ParseCIDR("100.64.0.0/10")
		for _, ip := range ips {
			if !block.Contains(ip.IP) {
				return errors.New("endpoint is outside configured Tailscale transport")
			}
		}
		address = net.JoinHostPort(ips[0].IP.String(), port)
	}
	var conn net.Conn
	var err error
	if e.Transport == "tls" {
		conn, err = (&tls.Dialer{Config: &tls.Config{MinVersion: tls.VersionTLS12}}).DialContext(ctx, "tcp", address)
	} else if e.Transport == "" || e.Transport == "local" || e.Transport == "tcp" || e.Transport == "tailscale" {
		conn, err = (&net.Dialer{}).DialContext(ctx, "tcp", address)
	} else {
		return errors.New("unknown Electrum transport")
	}
	if err != nil {
		return errors.New("electrum unavailable")
	}
	defer conn.Close()
	deadline, _ := ctx.Deadline()
	_ = conn.SetDeadline(deadline)
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 4096), 2<<20)
	// Write the calls, then read until every ID is answered. Notifications
	// (ID 0) are skipped; unknown or repeated IDs abort the whole batch.
	exchange := func(firstID int, batch []Request) error {
		var message []byte
		pending := make(map[int]any, len(batch))
		for i, request := range batch {
			params := request.Params
			if params == nil {
				params = []any{}
			}
			line, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": firstID + i, "method": request.Method, "params": params})
			if err != nil {
				return err
			}
			message = append(append(message, line...), '\n')
			pending[firstID+i] = request.Result
		}
		if _, err := conn.Write(message); err != nil {
			return errors.New("electrum write failed")
		}
		for lines := 0; len(pending) > 0 && lines < 8*len(batch) && scanner.Scan(); lines++ {
			var reply rpcReply
			if json.Unmarshal(scanner.Bytes(), &reply) != nil {
				return errors.New("invalid electrum response")
			}
			if reply.ID == 0 {
				continue
			}
			out, ok := pending[reply.ID]
			if !ok {
				return errors.New("electrum response ID mismatch")
			}
			delete(pending, reply.ID)
			if len(reply.Error) > 0 && string(reply.Error) != "null" {
				return errors.New("electrum rejected request")
			}
			if len(reply.Result) == 0 || string(reply.Result) == "null" {
				return errors.New("missing electrum result")
			}
			if err := json.Unmarshal(reply.Result, out); err != nil {
				return errors.New("invalid electrum result")
			}
		}
		if len(pending) > 0 {
			return errors.New("electrum response unavailable or oversized")
		}
		return nil
	}
	var features struct {
		Genesis string `json:"genesis_hash"`
	}
	// Confirm the network before revealing any script hash to the server.
	if err = exchange(1, []Request{{Method: "server.features", Result: &features}}); err != nil {
		return err
	}
	expected := e.Genesis
	if expected == "" {
		expected = mainnetGenesis
	}
	if features.Genesis != expected {
		return fmt.Errorf("electrum network mismatch")
	}
	if len(requests) == 1 && requests[0].Method == "server.features" {
		b, _ := json.Marshal(features)
		return json.Unmarshal(b, requests[0].Result)
	}
	return exchange(2, requests)
}
