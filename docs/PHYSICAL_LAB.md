# BRLN T-Display: physical lab validation

## Owner's real-funds send through LOS 0.5.48 (2026-10-24)

The pilot rule is no real funds; the owner chose to use their own. They received
1,000 sats on wallet `d11bc45b` and, after confirmation, sent 500 sats to
`bc1q0mqdl2t4rda5rfh8h8ca9drqv4qz8vamfxw4y5` at 1 sat/vB from the LOS Send tab
(Signer connected and unlocked there). The camera recorded the device review:
`Valor 1` 500 sats, `Troco 2` `bc1qy6xa2npws802c6mwml6a2wxsmkajutsc2ung9w`,
`Valor 2` 359 sats, `Taxa da rede` 141 sats, "Assinar agora?", "Assinando",
"Entradas assinadas: 1". Every value matched the app's review panel. The owner
approved with the buttons and broadcast it separately; txid
`55c9c3a13352ef67c831124833e01b0a9d583ade6b49e7e64fc15d015847c93f` showed as
pending at the destination.

Findings fixed in `a1fdc4e`: the amount screen showed "Valor N" instead of
naming the output, so the change amount read "Valor 2"; it now repeats the
address title ("Destino 1", "Troco 2"). After the broadcast the app showed "—"
for the balance next to a stale "sync complete" message and kept the spent coin
listed, while the open proposal disabled "Sincronizar" (workaround: "Encerrar
proposta", then sync). It now refreshes balance and history at once, keeping the
signed summary visible, and a broadcast proposal no longer blocks a sync.
`f8cccdf` also clears destination, amount and send-all after the broadcast, so
the plan card starts empty. At the owner's request `4e77a03` removed the test
wording from the device ("EM TESTE", "Use sem fundos reais"); LightningOS keeps
the pilot notice, and the connection screen reads "Signer conectado". CI firmware
ESP image hash for `4e77a03`:
`f15ca565b627bed07a3063704a06927233d97a13662810fc3c8dc52bd1843dad`.

LOS-TEST2 then received overlay `e142f92` with image `sha-4e77a03` (backup
`before-pin-4e77a03`; LND kept its PID). The installer served the four files
identical to CI. In a browser, the language toggle kept the app document, and
leaving for another LOS page and returning kept the same document (hidden, not
unmounted), so an open USB session survives LOS navigation. The board still runs
the previous firmware until it is reinstalled through LOS.

For the 0.5.49 club pilot, `4d80f4e` makes the installer show the hash the
Signer asks to approve (read from the verified `firmware.bin`); before, members
had nothing to compare it with. On LOS-TEST2 (overlay `6799f9e`, backup
`before-pin-4d80f4e`) the browser showed `f15ca565…1843dad` in the Signer's
4 x 16 layout, identical to CI. Firmware is unchanged from `4e77a03`.
`14498d5` adds **Apagar tudo** to the installer: a confirmation, a full chip erase
before writing (`eraseAll`), then MD5 checks that NVS (0x9000, 20 KB) and the
SPIFFS data partition (0x290000, 1.375 MB) read back as 0xFF before reset.
Covered by unit tests and seen in the TEST2 installer. It has not yet run on a
physical board, because the COM5 board holds the owner's funded wallet. Repeated blocks in the
owner's screenshot came from page stitching, not from the DOM.

## Fresh first-run journey through LOS 0.5.48 (2026-10-24)

Firmware `f9aaec8` (issue #7) moved PSBT review to balanced rows: on the COM5
board, `Destino 1` and `Troco 2` each fit one screen as 3 x 14 characters and the
signing states read "Assinando" and "Entradas assinadas". The first browser
installation of that firmware through LOS ended with a dark screen: esptool-js
0.7.0's hard reset only released RTS without pulsing EN, so the chip stayed in
the flasher stub until a serial reset. `4f61d5c` resets with DTR/RTS set together
(EN pulse, IO0 high); a real browser installation with it returned directly to the
hash screen, and the same check through LOS returned to the BRLN screen. Both
installations preserved the test wallet (`647804d1` read back after unlock). The
CI firmware hash `059f1605a997be5d503d85a64c8063ec178ef7731192768a5346627cddf28fb1`
is identical for `f9aaec8` and `4f61d5c` (reproducible build).

At the owner's request the board was then fully erased (`erase_flash`; the first
4 MB read back as 0xFF), destroying the old test wallet. The complete journey
then ran through LOS-TEST2 in the owner's browser: installer flash; on the
device "Preparar memória" with both confirmations; hash approval after camera
comparison with the published value; brln-3 pairing; local wallet creation
(password twice, automatic seed, 24 words written and checked; no camera during
secrets); public-account import (fingerprint `d11bc45b`, replacing the old
browser account), club Electrum sync, and a receive address identical on the
Signer and in the app (`bc1q0jx3x8gyeu0jpzzt4a3puhrmkzt6mfxrc3v0gr`). After lock,
disconnect, reconnection (board reboot) and a second unlock, the app accepted the
same account and issued the next address
(`bc1qklpgrhu04g5npg3h9t0w57wv6trytejp9qqgr8`), so storage persisted.
Remaining: recovery of the new words on a second board, passphrase unlock. The
receive screen still splits 19 + 19 + 4 on one page (review screens are balanced).

## LOS 0.5.48 session and on-device signing review (2026-10-24)

LOS-TEST2 runs the official 0.5.48-Beta with the Hardwallet overlay of
jvxis/brln-os-light#286 and image `67ae61e` (details in that repository's
`docs/HARDWALLET_VALIDATION.md`). The COM5 board keeps firmware `c880ef1` and
its test wallet (fingerprint `647804d1`).

Through LOS in the owner's browser: brln-3 pairing and authenticated
`/capabilities`, normal unlock on the buttons ("Desbloqueada"), synchronization
through the club Electrum ("Sincronização concluída", empty history), and a
receive address shown on the Signer, in the app and in its QR
(`bc1qww9mwtrk94vyjll632wpya5m2y0wp936d970fw`; camera read and bech32 checksum
confirmed).

Signing review used the independent Python brln-3 host with one unlock (the
password was typed on the device; no camera capture during entry). PSBTs were
built by the app's `preparePayment`/`createPsbt` for the wallet's public account
with synthetic UTXOs; nothing was broadcast. The device refused without any
button: owned change at `1/600` (`BRLN: one destination`), an input at `0/600`
(`BRLN: BIP84 inputs only`) and two destinations plus change
(`BRLN: 1-2 outputs`). For the app-shaped proposal the device showed
`Destino 1` (full address over two pages), 20000 sats, **`Troco 2`**
(`bc1qu25unny90u9wcmkezvv0uf6zqnz7tgl2uxwesd`, two pages), 79295 sats, fee 705
and "Assinar agora?"; the owner approved and the app's `finalizePsbt` verified
the signature (txid `28db72c9c383de42c6f78d6ba781eed9d2971700951b1f2ca7144a75e47750fc`,
141 vB). The same proposal was then rejected on the device
(`review_rejected`) and the session ended locked. UX notes: a 42-character
address splits into 38 + 4 characters, and the signing wait screen still reads
"Signing PSBT...".

## Signer-independent checks of c880ef1 (2026-10-23)

An independent brln-3 host written with Python `cryptography` (no app code)
paired with the COM5 board three times and exchanged authenticated frames.
Without buttons or an unlocked wallet the board answered `/capabilities brln-3 …`,
refused a host-supplied seed (`/restore 0 device_only`), a host-supplied password
(`/brln-unlock 0 invalid_request`) and a PSBT while locked (`/psbt-begin 0 locked`).
A replayed, a bit-flipped and an out-of-order frame each closed the channel
(`Secure channel closed: invalid frame`); later valid frames got no reply.

Against the club's public electrs 0.10.8, old (`e6b567f`) and new backends were
compared on the first 40 addresses of the public BIP84 test-vector account
(`abandon … about`): identical history, balance and UTXOs for all 40 (21 with
history); scan time 94.7 s for the old per-script route, 38.7 s for the new
per-script route and 4.7 s for two `/scripts` batches. A 21-hash batch is
rejected. Real Chrome behind a local HTTPS proxy (standing in for LOS) synced
that account in 13.9 s with 8 batch requests: 281 transactions, zero balance.

With a lab Electrum serving synthetic UTXOs, the same stack showed the missing
amount on insufficient balance, asked before a fee above 10% (cancel discarded
the proposal, accept built destination + change), and built a one-output sweep.
This exposed a pre-existing bug fixed here: re-synchronizing before a proposal
re-selected every coin, so a later attempt spent coins the user had unchecked.
PSBTs produced by the app (inputs on both branches, change at index 499, sweep)
pass the firmware scope with the matching seed and are pinned as vectors in
`tests/brln_psbt_policy_test.cpp`. Nothing was signed or broadcast.

## brln-3 channel, signing scope and sync limits (2026-10-23)

Source `c880ef1` (issues #1–#6) was built locally (48% flash, no warnings) and
written to the identity-guarded COM5 board (ESP32-D0WDQ6, 16 MB) without erase:
all four regions passed readback verification and wallet storage was preserved.
The embedded image hash shown on the device matched the package:

```text
bfde5ebdddd35574cf493ed686b1104ccc925412bdc1ae22c5970aae3de4b590
```

The owner approved the hash on the buttons. Raw-serial checks on the board then
returned `/pair 1 brln3_pairing_required`, `/check-pairing 1 brln3_pairing_required`,
`commitment_mismatch` for a reveal with a different key, `no_commitment` for a
repeated reveal, and `connection_period_expired` for a commit after 10 seconds.

Real Chrome with the local app build on `http://localhost` (no LOS session)
selected COM5 through the existing UI Automation helper. The app sent only
`/ping`, `/brln-pair-commit` and `/brln-pair-reveal`; the device and app showed
the same 8-digit codes (`5D51 CEBF`, `F58E 3007`, `78FA F3A2`, `5673 9154`, compared
through the camera), and the authenticated `/capabilities` exchange returned
`brln-3`, after which the app stayed connected. In two runs the dialog was
accepted by a trusted click in the Chrome window before the scripted decision;
this was recorded, not an app timeout.

Firmware frames match the browser byte for byte (shared vectors in
`tests/brln_channel_test.cpp` and `brln-channel.test.ts`). The BRLN PSBT scope is
covered natively, including mutation checks. Not yet validated on hardware:
unlock and PSBT review/refusal under the new scope (needs owner password entry),
backend batching against a live Electrs, and deployment through LOS. No seed,
password or funds were used.

## Owner-approved unlock and cached public summary (2026-10-15)

The owner approved the `5275570` hash and completed normal unlock. Camera
inspection showed `Desbloqueando / Aguarde / Nao desconecte`; the owner then
reported `Desbloqueada`, without an implicit passphrase prompt. The owner's LOS
capture subsequently showed full-address acknowledgment, QR and successful copy.
Advanced passphrase unlock and signing/recovery still require physical validation.

Coordinator source `b61de2f` retains an account/source-bound public display summary
(balance, transaction IDs/blocks, timestamp), never spendable inputs or secrets.
Opening the app restores it and starts a nonblocking update. Failed/cancelled
updates retain the last completed summary; source/account changes discard it.
Preparing a payment always re-queries Electrum and rejects changed/spent inputs.
The current device protocol remains compatible; no firmware update is needed.
104 unit tests, Svelte check/build and browser automatic scan/cache reload/age/
cancellation/session-expiry/changed-input rejection tests passed locally.

## Explicit wallet modes and LOS menu (2026-10-15)

After the owner released the serial port, the identity-guarded COM5 board was
updated to `5275570`. ESP32-D0WDQ6/16 MB identity and the unchanged partition
table were checked before writing. All four package regions passed independent
flash verification; wallet storage was not erased. Embedded firmware hash:
`c96e1772d1d228fd989a4c18794df194d74455aeae8633d3826ff0694705476a`.
Owner approval of this hash and testing both unlock modes remain pending.

Source `5275570` uses protocol `brln-2`. Normal unlock opens the empty BIP39
passphrase wallet directly after checking the storage password. The separate
advanced action `/brln-unlock-passphrase` requires a physical warning confirmation
and a nonempty passphrase entered on the signer. Neither command accepts host
arguments. Existing encrypted wallet storage and backup words are unchanged.
Old firmware is refused explicitly rather than silently retaining the former
unlock semantics. Physical validation of both new unlock paths is still pending.

The coordinator has Receive, Send and History views. QR/copy are offered only
after the user acknowledges comparing the full device address. History shows
only known transaction IDs and confirmation blocks, not inferred amounts. Public
account management is collapsible; no account is silently replaced on switching
wallets. Pairing/account confirmations use an in-page dialog for embedded use.

LOS integration preserves the coordinator origin/public-account storage inside
the authenticated Manager menu. Authenticated content permits framing only by
the same host on HTTPS port 8443; other ancestors and unauthenticated framing are
denied. The LOS frame delegates Serial only to the exact coordinator origin.
This remains a container app managed through the privilege broker.

Validation: 97 web unit tests, Svelte check/build, backend tests/vet, native
command policy and renderer bounds, browser discovery/cancellation/expiry and
Receive/Send/History navigation passed. CI run 38773587874 compiled ESP32 and
published amd64/arm64 images; anonymous OCI digests and four firmware artifacts
were verified. USB picker/flashing within the menu still needs physical testing.

## Owner-assisted creation and sync follow-up (2026-10-15)

Later owner-assisted checks confirmed successful unlock after the 7f5ed21 update:
camera observation showed the optional passphrase selection, then `Desbloqueada`.
The app and signer subsequently displayed the receiving address and the owner
compared it. The duplicate UI observation was clarified by the owner as a
capture artifact. No wallet recreation was required.

An additional usability gap remained: password verification during unlock did
not show progress. The follow-up source now draws `Desbloqueando / Aguarde`
before verification and labels the subsequent BIP39 passphrase choice as optional.
The current create flow has no passphrase selection and starts with an empty
BIP39 passphrase; the password entered/repeated there is the storage password.
App completion text and signer terminology were clarified. These latest changes
are not yet flashed/deployed; preserve the owner's currently unlocked session.

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

Follow-up firmware `7f5ed2111d2a0cbcfd175ff20eaeb3f9bca4b756` passed
[CI 38728510723](https://github.com/jvxis/brln-hardwallet/actions/runs/38728510723).
Only the authorized COM5 identity was programmed. The partition table is
byte-identical to the previous build; the four package regions passed independent
readback and no NVS/SPIFFS erase was performed. Camera inspection confirmed the
new embedded hash, still awaiting the owner's physical approval:
`e3d2674a1cf682e5fd217c6131911828031f7bd73766ee00ae59f9490e56d85f`.
Esptool intermittently estimated the 40 MHz crystal at 41.01 MHz; the last
readback reported 40 MHz without warning and all four regions matched.
Wallet unlock after this update remains an owner-assisted check.

The candidate browser completed real club Electrum discovery on LOS-TEST2 in
approximately 213 seconds, with 40 successful script requests, no JavaScript
errors, exactly one account section, and controls re-enabled. Unit tests (94),
Svelte check/build, native framebuffer checks and real Chrome regression tests
passed. The latter also ran against the static assets extracted from the exact
published OCI image: disconnected discovery, session expiry, cancellation and
control recovery. They use synthetic public accounts, never the owner's seed.

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
