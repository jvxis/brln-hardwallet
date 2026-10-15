# BRLN T-Display: physical lab validation

## Owner-assisted creation and sync follow-up (2026-10-15)

The owner approved the 0fa2151 firmware hash, paired the signer, entered and
repeated a test password, and recorded all 24 words. Camera inspection confirmed
the final backup acknowledgment followed by completion. Public account export
worked over USB; no seed/password was exported. Creation had no processing
feedback and the initial password option was misleading. The follow-up adds an
immediate waiting screen, a clear completion screen, and safe short-password
handling. These new screens still require validation on the physical device.

The browser's disconnected state does not prevent public account discovery.
On LOS-TEST2 each address query took approximately 4–6 seconds; the previous
UI disabled controls silently for the entire 40-address empty-account scan.
The follow-up shows progress and supports cancellation without committing a
partial snapshot. Zero is no longer presented as a discovered balance before a
successful scan. The owner's duplicated screenshot is not yet reproduced in
the isolated browser; it must not be described as a confirmed fixed defect.

This board now contains a test wallet. Preserve its storage during firmware
updates; recovery and transaction signing remain unvalidated.

Validation date: 2026-10-14. Disposable original ESP32 T-Display, 1.14-inch screen,
two buttons, CH9102 USB bridge and 16 MB physical flash. No wallet, seed or funds.
The owner explicitly authorized erase/reflash and bounded camera observations.

## Complete device layout follow-up (2026-10-15)

The owner compared the e7cc3bc hash but explicitly did **not** approve it on the
board: hash digits were readable, while headings and button hints were too small.
He requested action indicators beside the physical buttons and left the device
for continued lab work. No physical approvals were simulated.

Source `0fa215122199960ddd771d33ce825a6ac57ea541` uses a shared BRLN layout with
16-pixel minimum text, 24-pixel selected characters/words, 32-pixel pairing codes,
Portuguese operation labels, and upper/lower action arrows matching GPIO35/GPIO0
with USB to the right. Arrows are inset from the bezel after camera inspection.
Hash digits retain four rows of sixteen; help navigation cannot approve a build,
and an unavailable hash now fails closed. Transaction addresses are complete,
physically paginated, with separate amount/fee approval. Public address/xpub and
long status text are paginated instead of shrinking. See [device UI](DEVICE_UI.md)
for the fixture preview, control mapping and validation commands.

The native renderer executes production layout code with the same font/logo,
asserts text bounds/minimum size, exercises printable input characters and maximum
amounts, and tests cancellation on each address page and hash-help behavior.
Native Windows compilation, packaging tests and CI firmware tests passed.
[CI 38722348931](https://github.com/jvxis/brln-hardwallet/actions/runs/38722348931)
passed firmware and multi-architecture image gates. The exact authorized COM5
identity was checked before programming. All four final CI binaries were written
and independently verified against flash without erasing wallet storage. The
final probe/write/verify reported 40 MHz with no crystal-frequency warning.
Camera inspection confirmed the full hash, readable action labels and visible
inset arrows beside the upper/lower buttons. The board remains at this gate.

Latest expected embedded hash:
`b937c7528759777ef3718b42b21466f0bc1ad23075b8bd258f9a91477dd02c74`.

Physical approval, new-build pairing, password entry, backup/recovery and signing
still require owner interaction. Native fixture previews do not validate these
hardware flows. No seed/wallet was created and no funds were used.

## Pairing layout correction (2026-10-15)

The owner reported the pairing screen still showed the generic left-aligned
Confirm / Code layout. Camera inspection reproduced this on c1222a8.
Commit `e7cc3bc8f07594a10f9a100a0e25a6d3eae0bf32` adds a dedicated BRLN
pairing screen with the official mark, centered 32-pixel code and browser
comparison guidance. Pairing protocol and confirmation behavior are unchanged.
Native compilation and CI firmware policy/cryptography/build/package gates passed.
After the owner released COM5, the exact USB identity and 16 MB original ESP32
were checked; all four CI binaries were programmed and independently read back
successfully, preserving wallet storage. esptool reported a 41.01 MHz crystal
estimate during write/verify (normalized to 40 MHz); the initial probe reported
40 MHz without warning. No write or readback error occurred.
The camera showed the expected embedded hash:
`034079e16477fc80e0db13d60e6231435c4c2078207fae35c3b724cf142ee838`.
Physical hash approval and the new pairing screen inspection remain pending.
LOS-TEST2 still runs the c1222a8 app/installer image; this lab flash used the
new CI artifact directly.

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
After the owner released COM5, the guarded CLI identified the authorized CH9102
board and original ESP32 with 16 MB flash, then programmed all four c1222a8
package regions while preserving wallet storage and the fixed 4 MB layout.
Independent flash readback verified all four binaries. A bounded webcam capture
confirmed the expected image hash on the physical approval screen. Physical
button approval was subsequently confirmed by the owner. A second bounded
webcam capture showed the official white BR/LN and orange lightning mark,
centered on the boot screen, with the larger ASSINADOR BITCOIN subtitle and
no inherited mascot. Updated operational-screen inspection and wallet flows
remain pending. Earlier
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
