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

func (e Electrum) Call(ctx context.Context, method string, params []any, result any) error {
	switch method {
	case "server.features", "blockchain.headers.subscribe", "blockchain.scripthash.get_history", "blockchain.scripthash.get_balance", "blockchain.scripthash.listunspent", "blockchain.transaction.get", "blockchain.estimatefee", "blockchain.relayfee", "blockchain.transaction.broadcast":
	default:
		return errors.New("electrum method not allowed")
	}
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
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
	call := func(id int, name string, args []any, out any) error {
		msg, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": name, "params": args})
		if err != nil {
			return err
		}
		if _, err = conn.Write(append(msg, '\n')); err != nil {
			return errors.New("electrum write failed")
		}
		for count := 0; count < 8 && scanner.Scan(); count++ {
			var reply rpcReply
			if json.Unmarshal(scanner.Bytes(), &reply) != nil {
				return errors.New("invalid electrum response")
			}
			if reply.ID == 0 {
				continue
			}
			if reply.ID != id {
				return errors.New("electrum response ID mismatch")
			}
			if len(reply.Error) > 0 && string(reply.Error) != "null" {
				return errors.New("electrum rejected request")
			}
			if len(reply.Result) == 0 || string(reply.Result) == "null" {
				return errors.New("missing electrum result")
			}
			if err = json.Unmarshal(reply.Result, out); err != nil {
				return errors.New("invalid electrum result")
			}
			return nil
		}
		return errors.New("electrum response unavailable or oversized")
	}
	var features struct {
		Genesis string `json:"genesis_hash"`
	}
	if err = call(1, "server.features", []any{}, &features); err != nil {
		return err
	}
	expected := e.Genesis
	if expected == "" {
		expected = mainnetGenesis
	}
	if features.Genesis != expected {
		return fmt.Errorf("electrum network mismatch")
	}
	if method == "server.features" {
		b, _ := json.Marshal(features)
		return json.Unmarshal(b, result)
	}
	return call(2, method, params, result)
}
