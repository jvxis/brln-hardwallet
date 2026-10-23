/**
   @brief Create an encripted connection between the device and the client.
   It uses `Diffie-Hellman key exchange` to build a `shared secret`.
   It uses Advanced Encryption Standard (AES) symetric encryption with the `shared secret` as key.
   In this command certain configs can be initialized.
   @param data: String. Space separated values. Use minus (`-`) to skip the value.
    Value significance by position:
    0 - publicKeyHex: String (optional). The public key of the client in hex format, used in DHKE.
    1 - button1Pin: legacy field, accepted but ignored. Pins come from the board profile.
    2 - button2Pin: legacy field, accepted but ignored. Pins come from the board profile.
    3 - persistSecrets: boolean (optional).
          - Persist the password-protected wallet record when restoring a wallet.
          - Set to `false` in air-gapped mode when the seed is provided in `commands.in.txt`
          - Defaults to `true`

   @return CommandResponse
*/
CommandResponse executePair(String data) {
  if ((millis() - global.startTime) > 10 * 1000) {
    Serial.println(COMMAND_PAIR + " 1 " + " connection_period_expired");
    return {"Connection Refused", "10 secs from reboot passed"};
  }

  // A legacy client needs 128 hex characters plus three short positional
  // options. Refuse oversized unauthenticated frames before token parsing.
  if (data.length() > 192) {
    Serial.println(COMMAND_PAIR + " 1 invalid_request");
    return {"Pairing refused", "Request too long"};
  }

  String publicKeyHex = getWordAtPosition(data, 0);
  String button1Pin = getWordAtPosition(data, 1);
  String button2Pin = getWordAtPosition(data, 2);
  String persistSecrets = getWordAtPosition(data, 3);

  if (isNotEmptyParam(publicKeyHex)) {
    return pair(publicKeyHex, button1Pin, button2Pin, persistSecrets);
  }

  if (persistSecrets == "false") global.persistSecrets = false;

  return {"Pairing", "Not encrypted"};
}

CommandResponse pair(
  String publicKeyHex,
  String button1Pin,
  String button2Pin,
  String persistSecrets
) {
  if (publicKeyHex.length() != 128 || isStrictHex(publicKeyHex) == false) {
    Serial.println(COMMAND_PAIR + " 1 invalid_public_key");
    return {"Pairing refused", "Invalid public key"};
  }

  byte dhe_secret[32] = {0};
  if (!deriveHealthyHardwareEntropy(dhe_secret, sizeof(dhe_secret))) {
    clearSensitiveBytes(dhe_secret, sizeof(dhe_secret));
    Serial.println(COMMAND_PAIR + " 1 rng_failure");
    return {"RNG failure", "Pairing aborted"};
  }

  uint8_t compressedPublicKey[EC_PUBLIC_KEY_LEN] = {0};
  uint8_t publicKey[EC_PUBLIC_KEY_UNCOMPRESSED_LEN] = {0};
  if (wally_ec_public_key_from_private_key(
        dhe_secret, sizeof(dhe_secret), compressedPublicKey, sizeof(compressedPublicKey)
      ) != WALLY_OK ||
      wally_ec_public_key_decompress(
        compressedPublicKey, sizeof(compressedPublicKey), publicKey, sizeof(publicKey)
      ) != WALLY_OK) {
    clearSensitiveBytes(dhe_secret, sizeof(dhe_secret));
    clearSensitiveBytes(compressedPublicKey, sizeof(compressedPublicKey));
    clearSensitiveBytes(publicKey, sizeof(publicKey));
    Serial.println(COMMAND_PAIR + " 1 rng_failure");
    return {"RNG failure", "Pairing aborted"};
  }

  byte publicKeyBin[EC_PUBLIC_KEY_UNCOMPRESSED_LEN] = {0};
  publicKeyBin[0] = 0x04;
  if (!hexStringToBytes(publicKeyHex, publicKeyBin + 1, sizeof(publicKeyBin) - 1)) {
    clearSensitiveBytes(publicKeyBin, sizeof(publicKeyBin));
    clearSensitiveBytes(dhe_secret, sizeof(dhe_secret));
    clearSensitiveBytes(compressedPublicKey, sizeof(compressedPublicKey));
    clearSensitiveBytes(publicKey, sizeof(publicKey));
    Serial.println(COMMAND_PAIR + " 1 invalid_public_key");
    return {"Pairing refused", "Invalid public key"};
  }
  if (!legacyCompatibleEcdh(
        dhe_secret, publicKeyBin, global.dhe_shared_secret
      )) {
    clearSensitiveBytes(publicKeyBin, sizeof(publicKeyBin));
    clearSensitiveBytes(dhe_secret, sizeof(dhe_secret));
    clearSensitiveBytes(compressedPublicKey, sizeof(compressedPublicKey));
    clearSensitiveBytes(publicKey, sizeof(publicKey));
    Serial.println(COMMAND_PAIR + " 1 invalid_public_key");
    return {"Pairing refused", "Invalid public key"};
  }
  clearSensitiveBytes(publicKeyBin, sizeof(publicKeyBin));
  clearSensitiveBytes(dhe_secret, sizeof(dhe_secret));
  clearSensitiveBytes(compressedPublicKey, sizeof(compressedPublicKey));

  String devicePublicKeyHex = bytesToHexString(publicKey + 1, sizeof(publicKey) - 1);
  clearSensitiveBytes(publicKey, sizeof(publicKey));
  String sharedSecretHex = bytesToHexString(global.dhe_shared_secret, sizeof(global.dhe_shared_secret));
  if (devicePublicKeyHex == "" || sharedSecretHex == "") {
    clearSensitiveBytes(global.dhe_shared_secret, sizeof(global.dhe_shared_secret));
    Serial.println(COMMAND_PAIR + " 1 crypto_failure");
    return {"Pairing failed", "Crypto memory error"};
  }
  Serial.println(COMMAND_PAIR + " 0 " + devicePublicKeyHex);

  // Do not let a malformed unauthenticated request mutate session policy.
  if (persistSecrets == "false") global.persistSecrets = false;
  updateDeviceConfig(button1Pin, button2Pin);

  String fingerprint = hashStringData(sharedSecretHex).substring(0, 5);
  fingerprint.toUpperCase();
  return {"Confirm", "Code: " + fingerprint };
}

void updateDeviceConfig(String button1Pin, String button2Pin) {
  // Retain the legacy positional parameters for client compatibility, but do
  // not let an unauthenticated pairing frame reassign hardware GPIOs.
  if (isNotEmptyParam(button1Pin) || isNotEmptyParam(button2Pin)) {
    logInfo("Pairing button pin overrides ignored for board " + String(BOARD.id));
  }
  global.button1Pin = BOARD.primaryButtonPin;
  global.button2Pin = BOARD.secondaryButtonPin;
  writeFile(SPIFFS, global.deviceMetaFileName.c_str(), global.deviceId);
}

#ifdef BOWSER_BRLN
// brln-3 pairing. The host first commits to SHA256(its public key); the device
// then reveals its key, and only afterwards the host reveals its own. A relay
// therefore cannot try host keys until both pairing codes match.
struct BrlnPairing {
  uint8_t secret[EC_PRIVATE_KEY_LEN];
  uint8_t commitment[SHA256_LEN];
  uint8_t devicePublicKey[brln::CHANNEL_PUBLIC_KEY_SIZE];
  bool pending;
};
BrlnPairing brlnPairing = {};

// A new or broken channel never inherits an unlocked wallet.
void brlnLockWallet() {
  global.authenticated = false;
  brlnClear(global.mnemonic);
  brlnClear(global.passphrase);
}

void clearBrlnPairing() {
  clearSensitiveBytes((uint8_t *)&brlnPairing, sizeof(brlnPairing));
}

CommandResponse refuseBrlnPairing(const String &command, const String &code, const String &detail) {
  clearBrlnPairing();
  Serial.println(command + " 1 " + code);
  return {"Pairing refused", detail};
}

CommandResponse executeBrlnPairCommit(String data) {
  clearBrlnPairing();
  brln::clearChannel(&brlnChannel);
  brlnLockWallet();
  if ((millis() - global.startTime) > 10 * 1000) {
    return refuseBrlnPairing(COMMAND_BRLN_PAIR_COMMIT, "connection_period_expired", "10 secs from reboot passed");
  }
  if (data.length() != SHA256_LEN * 2 || !isStrictHex(data) ||
      !hexStringToBytes(data, brlnPairing.commitment, sizeof(brlnPairing.commitment))) {
    return refuseBrlnPairing(COMMAND_BRLN_PAIR_COMMIT, "invalid_commitment", "Invalid request");
  }
  uint8_t compressed[EC_PUBLIC_KEY_LEN] = {0};
  uint8_t uncompressed[EC_PUBLIC_KEY_UNCOMPRESSED_LEN] = {0};
  const bool ok =
    deriveHealthyHardwareEntropy(brlnPairing.secret, sizeof(brlnPairing.secret)) &&
    wally_ec_public_key_from_private_key(brlnPairing.secret, sizeof(brlnPairing.secret),
                                         compressed, sizeof(compressed)) == WALLY_OK &&
    wally_ec_public_key_decompress(compressed, sizeof(compressed),
                                   uncompressed, sizeof(uncompressed)) == WALLY_OK;
  memcpy(brlnPairing.devicePublicKey, uncompressed + 1, sizeof(brlnPairing.devicePublicKey));
  clearSensitiveBytes(compressed, sizeof(compressed));
  clearSensitiveBytes(uncompressed, sizeof(uncompressed));
  if (!ok) return refuseBrlnPairing(COMMAND_BRLN_PAIR_COMMIT, "rng_failure", "RNG failure");
  brlnPairing.pending = true;
  Serial.println(COMMAND_BRLN_PAIR_COMMIT + " 0 " +
    bytesToHexString(brlnPairing.devicePublicKey, sizeof(brlnPairing.devicePublicKey)));
  return {"Pairing", "Waiting for app"};
}

CommandResponse executeBrlnPairReveal(String data) {
  if (!brlnPairing.pending || (millis() - global.startTime) > 20 * 1000) {
    return refuseBrlnPairing(COMMAND_BRLN_PAIR_REVEAL, "no_commitment", "Restart device");
  }
  uint8_t hostKey[EC_PUBLIC_KEY_UNCOMPRESSED_LEN] = {0x04};
  uint8_t digest[SHA256_LEN] = {0};
  uint8_t shared[SHA256_LEN] = {0};
  uint8_t sas[brln::CHANNEL_SAS_SIZE] = {0};
  const bool parsed = data.length() == brln::CHANNEL_PUBLIC_KEY_SIZE * 2 && isStrictHex(data) &&
    hexStringToBytes(data, hostKey + 1, brln::CHANNEL_PUBLIC_KEY_SIZE) &&
    wally_sha256(hostKey + 1, brln::CHANNEL_PUBLIC_KEY_SIZE, digest, sizeof(digest)) == WALLY_OK;
  const bool committed = parsed && brln::constantTimeEqual(digest, brlnPairing.commitment, sizeof(digest));
  const bool derived = committed && legacyCompatibleEcdh(brlnPairing.secret, hostKey, shared) &&
    brln::deriveChannel(shared, hostKey + 1, brlnPairing.devicePublicKey, true, &brlnChannel, sas);
  clearSensitiveBytes(digest, sizeof(digest));
  clearSensitiveBytes(shared, sizeof(shared));
  clearSensitiveBytes(hostKey, sizeof(hostKey));
  clearBrlnPairing();
  if (!derived) {
    brln::clearChannel(&brlnChannel);
    clearSensitiveBytes(sas, sizeof(sas));
    return refuseBrlnPairing(COMMAND_BRLN_PAIR_REVEAL, committed ? "invalid_public_key" : "commitment_mismatch", "Restart device");
  }
  char code[10] = {0};
  brln::formatSas(sas, code);
  clearSensitiveBytes(sas, sizeof(sas));
  Serial.println(COMMAND_BRLN_PAIR_REVEAL + " 0");
  return {"Confirm", "Code: " + String(code)};
}

String brlnSealLine(const String &message) {
  if (!brlnChannel.active) return "";
  uint8_t iv[brln::CHANNEL_IV_SIZE] = {0};
  if (!deriveHealthyHardwareEntropy(iv, sizeof(iv))) return "";
  const size_t size = brln::sealedLength(message.length());
  uint8_t *sealed = (uint8_t *)malloc(size);
  if (sealed == NULL) return "";
  String result = "";
  if (brln::seal(&brlnChannel, iv, (const uint8_t *)message.c_str(), message.length(), sealed, size)) {
    result = bytesToHexString(sealed, size);
  }
  clearSensitiveBytes(iv, sizeof(iv));
  clearSensitiveBytes(sealed, size);
  free(sealed);
  return result;
}

// Any authentication, order or format failure closes the channel: the app must
// reconnect, which reboots the device and requires a new committed pairing.
String brlnOpenLine(const String &hex) {
  const size_t size = hex.length() / 2;
  uint8_t *sealed = brlnChannel.active && hex.length() % 2 == 0 && isStrictHex(hex) ? (uint8_t *)malloc(size) : NULL;
  uint8_t *message = sealed ? (uint8_t *)malloc(size + 1) : NULL;
  size_t written = 0;
  const bool ok = message && hexStringToBytes(hex, sealed, size) &&
    brln::open(&brlnChannel, sealed, size, message, size, &written) && memchr(message, 0, written) == NULL;
  String result = "";
  if (ok) { message[written] = 0; result = String((const char *)message); }
  if (sealed) { clearSensitiveBytes(sealed, size); free(sealed); }
  if (message) { clearSensitiveBytes(message, size + 1); free(message); }
  if (!ok && brlnChannel.active) {
    brln::clearChannel(&brlnChannel);
    brlnLockWallet();
    logInfo("Secure channel closed: invalid frame");
  }
  return result;
}
#endif
