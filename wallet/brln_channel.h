#pragma once
// brln-3 serial channel. Pairing commits to the host key before the device key
// is revealed, so a relay cannot grind matching codes. HKDF-SHA256 derives one
// key pair per direction; frames are AES-256-CBC, then HMAC-SHA256 over IV and
// ciphertext, with a strict per-direction counter inside the ciphertext.
// Include libwally and tiny-AES-c before this header. The browser side is
// webapp/src/lib/brln-channel.ts; tests/brln_channel_test.cpp pins both to vectors.
#include <cstring>

namespace brln {
const size_t CHANNEL_KEY_SIZE = 32;
const size_t CHANNEL_IV_SIZE = 16;
const size_t CHANNEL_TAG_SIZE = 32;
const size_t CHANNEL_HEADER_SIZE = 12;  // 8-byte counter, 4-byte length, big-endian
const size_t CHANNEL_PUBLIC_KEY_SIZE = 64;  // Uncompressed x||y without the 0x04 prefix
const size_t CHANNEL_SAS_SIZE = 4;

struct Channel {
  uint8_t sendEncryption[CHANNEL_KEY_SIZE];
  uint8_t sendAuthentication[CHANNEL_KEY_SIZE];
  uint8_t receiveEncryption[CHANNEL_KEY_SIZE];
  uint8_t receiveAuthentication[CHANNEL_KEY_SIZE];
  uint64_t sendCounter;
  uint64_t receiveCounter;
  bool active;
};

inline void clearChannel(Channel *channel) { wally_bzero(channel, sizeof(*channel)); }

inline bool constantTimeEqual(const uint8_t *left, const uint8_t *right, size_t length) {
  uint8_t difference = 0;
  for (size_t i = 0; i < length; i++) difference |= left[i] ^ right[i];
  return difference == 0;
}

// RFC 5869 with SHA-256. `info` must be at most 32 bytes.
inline bool hkdfSha256(const uint8_t *salt, size_t saltLength, const uint8_t *secret,
                       size_t secretLength, const char *info, uint8_t *output, size_t outputLength) {
  const size_t infoLength = strlen(info);
  if (infoLength > 32 || outputLength > 255 * 32) return false;
  uint8_t key[32] = {0}, block[32] = {0}, buffer[32 + 32 + 1] = {0};
  bool ok = wally_hmac_sha256(salt, saltLength, secret, secretLength, key, sizeof(key)) == WALLY_OK;
  size_t produced = 0;
  for (uint8_t counter = 1; ok && produced < outputLength; counter++) {
    size_t length = 0;
    if (counter > 1) { memcpy(buffer, block, sizeof(block)); length = sizeof(block); }
    memcpy(buffer + length, info, infoLength);
    length += infoLength;
    buffer[length++] = counter;
    ok = wally_hmac_sha256(key, sizeof(key), buffer, length, block, sizeof(block)) == WALLY_OK;
    const size_t take = outputLength - produced < sizeof(block) ? outputLength - produced : sizeof(block);
    if (ok) memcpy(output + produced, block, take);
    produced += take;
  }
  wally_bzero(key, sizeof(key));
  wally_bzero(block, sizeof(block));
  wally_bzero(buffer, sizeof(buffer));
  if (!ok) wally_bzero(output, outputLength);
  return ok;
}

inline bool deriveChannel(const uint8_t shared[32], const uint8_t hostPublicKey[CHANNEL_PUBLIC_KEY_SIZE],
                          const uint8_t devicePublicKey[CHANNEL_PUBLIC_KEY_SIZE], bool forDevice,
                          Channel *channel, uint8_t sas[CHANNEL_SAS_SIZE]) {
  clearChannel(channel);
  static const char label[] = "BRLN pair v3";
  uint8_t transcript[sizeof(label) - 1 + 2 * CHANNEL_PUBLIC_KEY_SIZE] = {0};
  memcpy(transcript, label, sizeof(label) - 1);
  memcpy(transcript + sizeof(label) - 1, hostPublicKey, CHANNEL_PUBLIC_KEY_SIZE);
  memcpy(transcript + sizeof(label) - 1 + CHANNEL_PUBLIC_KEY_SIZE, devicePublicKey, CHANNEL_PUBLIC_KEY_SIZE);
  uint8_t salt[32] = {0}, keys[4 * CHANNEL_KEY_SIZE] = {0};
  const bool ok = wally_sha256(transcript, sizeof(transcript), salt, sizeof(salt)) == WALLY_OK &&
                  hkdfSha256(salt, sizeof(salt), shared, 32, "BRLN channel v3", keys, sizeof(keys)) &&
                  hkdfSha256(salt, sizeof(salt), shared, 32, "BRLN SAS v3", sas, CHANNEL_SAS_SIZE);
  if (ok) {
    // keys: host->device encryption, authentication; device->host encryption, authentication.
    const uint8_t *hostToDevice = keys, *deviceToHost = keys + 2 * CHANNEL_KEY_SIZE;
    const uint8_t *send = forDevice ? deviceToHost : hostToDevice;
    const uint8_t *receive = forDevice ? hostToDevice : deviceToHost;
    memcpy(channel->sendEncryption, send, CHANNEL_KEY_SIZE);
    memcpy(channel->sendAuthentication, send + CHANNEL_KEY_SIZE, CHANNEL_KEY_SIZE);
    memcpy(channel->receiveEncryption, receive, CHANNEL_KEY_SIZE);
    memcpy(channel->receiveAuthentication, receive + CHANNEL_KEY_SIZE, CHANNEL_KEY_SIZE);
    channel->active = true;
  } else {
    wally_bzero(sas, CHANNEL_SAS_SIZE);
  }
  wally_bzero(transcript, sizeof(transcript));
  wally_bzero(salt, sizeof(salt));
  wally_bzero(keys, sizeof(keys));
  return ok;
}

inline size_t sealedLength(size_t messageLength) {
  const size_t body = (CHANNEL_HEADER_SIZE + messageLength + 15) / 16 * 16;
  return CHANNEL_IV_SIZE + body + CHANNEL_TAG_SIZE;
}

// Writes IV || ciphertext || tag. `output` must hold sealedLength(messageLength).
inline bool seal(Channel *channel, const uint8_t iv[CHANNEL_IV_SIZE], const uint8_t *message,
                 size_t messageLength, uint8_t *output, size_t capacity) {
  if (!channel->active || channel->sendCounter == UINT64_MAX || messageLength > 0xffffffffu ||
      capacity < sealedLength(messageLength)) return false;
  const size_t body = sealedLength(messageLength) - CHANNEL_IV_SIZE - CHANNEL_TAG_SIZE;
  uint8_t *frame = output + CHANNEL_IV_SIZE;
  memset(output, 0, CHANNEL_IV_SIZE + body);
  memcpy(output, iv, CHANNEL_IV_SIZE);
  for (int i = 0; i < 8; i++) frame[i] = (uint8_t)(channel->sendCounter >> (56 - 8 * i));
  for (int i = 0; i < 4; i++) frame[8 + i] = (uint8_t)(messageLength >> (24 - 8 * i));
  memcpy(frame + CHANNEL_HEADER_SIZE, message, messageLength);
  AES_ctx context;
  AES_init_ctx_iv(&context, channel->sendEncryption, iv);
  AES_CBC_encrypt_buffer(&context, frame, body);
  wally_bzero(&context, sizeof(context));
  if (wally_hmac_sha256(channel->sendAuthentication, CHANNEL_KEY_SIZE, output, CHANNEL_IV_SIZE + body,
                        output + CHANNEL_IV_SIZE + body, CHANNEL_TAG_SIZE) != WALLY_OK) {
    wally_bzero(output, capacity);
    return false;
  }
  channel->sendCounter++;
  return true;
}

// Verifies before decrypting. On success the message is at the start of
// `output` (capacity >= sealedLength - IV - tag) and its length in `written`.
inline bool open(Channel *channel, const uint8_t *sealed, size_t sealedSize, uint8_t *output,
                 size_t capacity, size_t *written) {
  *written = 0;
  if (!channel->active || sealedSize < CHANNEL_IV_SIZE + 16 + CHANNEL_TAG_SIZE ||
      (sealedSize - CHANNEL_IV_SIZE - CHANNEL_TAG_SIZE) % 16 != 0) return false;
  const size_t body = sealedSize - CHANNEL_IV_SIZE - CHANNEL_TAG_SIZE;
  if (capacity < body) return false;
  uint8_t tag[CHANNEL_TAG_SIZE] = {0};
  if (wally_hmac_sha256(channel->receiveAuthentication, CHANNEL_KEY_SIZE, sealed, CHANNEL_IV_SIZE + body,
                        tag, sizeof(tag)) != WALLY_OK ||
      !constantTimeEqual(tag, sealed + CHANNEL_IV_SIZE + body, CHANNEL_TAG_SIZE)) {
    wally_bzero(tag, sizeof(tag));
    return false;
  }
  wally_bzero(tag, sizeof(tag));
  memcpy(output, sealed + CHANNEL_IV_SIZE, body);
  AES_ctx context;
  AES_init_ctx_iv(&context, channel->receiveEncryption, sealed);
  AES_CBC_decrypt_buffer(&context, output, body);
  wally_bzero(&context, sizeof(context));
  uint64_t counter = 0;
  uint32_t length = 0;
  for (int i = 0; i < 8; i++) counter = (counter << 8) | output[i];
  for (int i = 0; i < 4; i++) length = (length << 8) | output[8 + i];
  if (counter != channel->receiveCounter || length > body - CHANNEL_HEADER_SIZE) {
    wally_bzero(output, body);
    return false;
  }
  memmove(output, output + CHANNEL_HEADER_SIZE, length);
  memset(output + length, 0, body - length);
  channel->receiveCounter++;
  *written = length;
  return true;
}

// Eight uppercase hex digits shown as "XXXX XXXX" on the device and in the app.
inline void formatSas(const uint8_t sas[CHANNEL_SAS_SIZE], char output[10]) {
  static const char digits[] = "0123456789ABCDEF";
  size_t position = 0;
  for (size_t i = 0; i < CHANNEL_SAS_SIZE; i++) {
    if (i == 2) output[position++] = ' ';
    output[position++] = digits[sas[i] >> 4];
    output[position++] = digits[sas[i] & 15];
  }
  output[position] = 0;
}
}  // namespace brln
