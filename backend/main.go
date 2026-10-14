package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "-version" {
		println("brln-hardwallet 0.1.0-dev")
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		client := http.Client{Timeout: 3 * time.Second}
		resp, err := client.Get("http://127.0.0.1:8080/healthz")
		if err != nil {
			os.Exit(1)
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			os.Exit(1)
		}
		return
	}
	token, err := os.ReadFile(os.Getenv("BRLN_AUTH_TOKEN_FILE"))
	if err != nil || len(strings.TrimSpace(string(token))) < 32 {
		log.Fatal("valid proxy token file required")
	}
	address := os.Getenv("BRLN_ELECTRUM_ADDR")
	if address == "" {
		address = "electrs:50001"
	}
	static := os.Getenv("BRLN_WEB_ROOT")
	if static == "" {
		static = "/app/web"
	}
	app := NewApp(Electrum{Address: address, Transport: os.Getenv("BRLN_ELECTRUM_TRANSPORT")}, strings.TrimSpace(string(token)), http.FileServer(http.Dir(static)))
	app.Source = os.Getenv("BRLN_ELECTRUM_SOURCE")
	if app.Source == "" {
		app.Source = "local"
	}
	if app.Source != "local" && app.Source != "club" {
		log.Fatal("invalid Electrum source")
	}
	server := &http.Server{Addr: ":8080", Handler: app, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 40 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	log.Print("BRLN Hardwallet experimental backend listening on :8080")
	log.Fatal(server.ListenAndServe())
}
