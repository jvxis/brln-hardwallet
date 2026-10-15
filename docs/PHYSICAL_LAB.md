# BRLN T-Display: physical lab validation

Validation date: 2026-10-14. Disposable original ESP32 T-Display, 1.14-inch screen,
two buttons, CH9102 USB bridge and 16 MB physical flash. No wallet, seed or funds.
The owner explicitly authorized erase/reflash and bounded camera observations.

## Readability and identity follow-up (2026-10-15)

The owner physically approved the prior firmware hash, compared pairing code
`92AFB` and confirmed it in the browser. The app accepted BRLN capabilities.
Local creation reached `Repeat password`; the owner then cancelled, before seed
generation or storage. This exposed poor readability in the local input screens.

Commit `c1222a8670a34cac85d95bd42341095706c7442e` enlarges operational titles,
counts and button instructions to 16 pixels, with the selected character/action
at 32 pixels. Password content remains hidden. The official logo from
https://br-ln.com/static-landing/brln-logo.png is compiled into boot and local
operation screens; colors follow the public BRLN site. Source/provenance and
rebuild instructions are in `assets/brand/README.md`.

The app now keeps first-install preparation collapsible, remembers that it was
shown, and exposes a shortcut for boards already prepared. It inherits the LOS
visual theme, palette and light/dark mode when opened from the Store. Themes and
fonts are bundled locally. Only validated appearance enums cross the port boundary
in a consumed URL fragment; preferences are handled by the audited storage module.
Reopen from the Store after changing the LOS appearance.

91 web tests, Svelte checks, production builds and native firmware compilation
passed. The browser regression reproduced the old app ignoring LOS appearance.
Candidate and deployed browser validation covered twelve theme/mode combinations against LOS
computed colors/background/font, remembered collapse, reopening, acknowledgement
and mobile overflow. [CI 38716906395](https://github.com/jvxis/brln-hardwallet/actions/runs/38716906395)
passed and published the new firmware and multi-architecture app image.

New ESP display hash:
`60db227bb4d2bcdf1653bae3bf8f77329faa972893867bc8d08ba30390df1064`.
The attempted lab write stopped before programming because COM5 was unavailable;
the owner was asked to disconnect the browser while keeping the USB cable.
Physical inspection and approval of this new build are still pending. Earlier
sections below are historical evidence for the previous firmware.

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
