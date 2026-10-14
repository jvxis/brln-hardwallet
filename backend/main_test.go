package main

import (
	"bytes"
	"os"
	"os/exec"
	"testing"
)

// LOS probes stdout from the hardened container; stderr does not prove its version.
func TestVersionFlagUsesStdout(t *testing.T) {
	if os.Getenv("BRLN_TEST_VERSION_PROCESS") == "1" {
		os.Args = []string{"brln-hardwallet", "-version"}
		main()
		os.Exit(0)
	}
	command := exec.Command(os.Args[0], "-test.run=^TestVersionFlagUsesStdout$")
	command.Env = append(os.Environ(), "BRLN_TEST_VERSION_PROCESS=1")
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Run(); err != nil {
		t.Fatal(err)
	}
	if stdout.String() != "brln-hardwallet 0.1.0-dev\n" || stderr.Len() != 0 {
		t.Fatalf("invalid probe output: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}
