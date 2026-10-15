# BRLN T-Display: physical lab validation

Validation date: 2026-10-14. Disposable original ESP32 T-Display, 1.14-inch screen,
two buttons, CH9102 USB bridge and 16 MB physical flash. No wallet, seed or funds.
The owner explicitly authorized erase/reflash and bounded camera observations.

## Tested version

Source: `f60d68b46975d6890070b1f55d0c5b58f94fa4c0`.
[CI run](https://github.com/jvxis/brln-hardwallet/actions/runs/38656838951).
OCI digest: `sha256:16f414010fbe5d93ca9e9dc69b870380d26edbca94e74a9f64efcd6f7f462fbb`.

86 web tests passed; Svelte reported no errors/warnings. Native policy,
cryptography, firmware packaging, original ESP32 compilation and amd64/arm64
image builds passed. Anonymous OCI index/layers and all packaged hashes were
independently checked. This does not constitute an independent security audit.

## Physical observations

The original 16 MB board works with the fixed 4 MB firmware layout. The installer
accepts only original ESP32 with 4 or 16 MB and preserves packaged headers.
Initial CLI erase/write/readback of the earlier build passed, and the owner
physically formatted its storage and checked the initial firmware hash.

Real Chrome exposed two startup failures: a UART framing error while the ROM
bootloader emits at a different baud rate, and a request sent before storage/RNG
startup was complete. The app now recovers at most three boot framing errors,
only before any protocol command; it resets the selected T-Display and waits for
its actual startup notice. Terminal failures close the port; reboot invalidates
the encrypted session. Regression tests cover these boundaries and timeouts.

The final app was deployed through the normal LOS broker on LOS-TEST2. Real
Chrome paired with the earlier firmware after camera comparison of the board's
pairing code and accepted the BRLN capabilities. The deployed integrated
installer then identified 16 MB, programmed all four final binaries, verified
readback and reset the board. The exact authorized USB identity was checked
before operations and the native chooser selection was verified before Connect.

Camera observations of the new boot confirmed the centered BRLN mark, equal
spacing around the bolt, larger subtitle and absence of the inherited mascot.
The on-screen ESP image hash matched:

```text
cbfa386c46b8e5e9de2dec64878e40506582f480c1316ee80ef58ee84c68d695
```

This is the ESP embedded image hash shown by the device, not the SHA-256 of the
entire firmware file in the installer manifest. The board remains at physical
hash approval; tests did not bypass its buttons. Final-firmware pairing after
that approval, seed entry, backup/recovery, address review and signing remain
unvalidated. No wallet or seed was created during these tests.

## LOS verification

[Draft PR #260](https://github.com/jvxis/brln-os-light/pull/260) targets
`agent/0.5.45-release`. Full Go tests/vet, eleven native privileged fixtures and
broker self-test passed. Same-host LAN Open, public Electrum status/fees,
private address bindings, anonymous access denial, logout revocation and Origin
checks passed. Authenticated firmware files matched CI byte-for-byte.

Only the lab Manager and Hardwallet were restarted, with backups. LND retained
its process and synchronization; unrelated containers were preserved. No
production VPS change or VM reboot was performed. Native arm64 runtime,
long-running lifecycle/certificate renewal and full wallet flows remain open.
