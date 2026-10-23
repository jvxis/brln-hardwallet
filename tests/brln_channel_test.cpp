#include <cassert>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

extern "C" {
#include "libwally.h"
}
#include "aes.h"
#include "../wallet/brln_channel.h"

// Vectors produced by webapp/src/lib/brln-channel.ts (see brln-channel.test.ts).
namespace {
const char *HOST_FIRST =
  "444444444444444444444444444444444926cbfa61f71f1a4259d16339a9fe541ce14b2c3b946d92e421d830b65d6e6b"
  "3914e18b9f23ab7480a619f38a6a3aeb1cd484b38d5c17bbeac0136772267dc9";
const char *HOST_SECOND =
  "45454545454545454545454545454545047af7ead7f418a9816c1b07636b0c86fde8f43448e5dc3468a906b3135fd676"
  "2f281808d86191f0865af8a114dd7100cd6eed91a51248b280589c74c6be6a7b61d38a373864505672d545e1bf89c88b";
const char *DEVICE_FIRST =
  "5555555555555555555555555555555541ce9b4d5faf48c1bbcfa13a815111301bb278bfcb641f80ea29e3dbd2dcd4f6"
  "1daa8be5182ecb428448f5004fd1c090fdbb1a2d9516ef4a87eb1fd0f307acf9";

std::vector<uint8_t> bytes(const char *hex) {
  std::vector<uint8_t> result(std::strlen(hex) / 2);
  size_t written = 0;
  assert(wally_hex_to_bytes(hex, result.data(), result.size(), &written) == WALLY_OK && written == result.size());
  return result;
}

std::string hex(const std::vector<uint8_t> &data) {
  char *text = NULL;
  assert(wally_hex_from_bytes(data.data(), data.size(), &text) == WALLY_OK);
  std::string result(text);
  wally_free_string(text);
  return result;
}

bool openText(brln::Channel *channel, const std::vector<uint8_t> &sealed, std::string *message) {
  std::vector<uint8_t> output(sealed.size());
  size_t written = 0;
  if (!brln::open(channel, sealed.data(), sealed.size(), output.data(), output.size(), &written)) return false;
  message->assign((const char *)output.data(), written);
  return true;
}

std::vector<uint8_t> sealText(brln::Channel *channel, uint8_t ivByte, const std::string &message) {
  uint8_t iv[brln::CHANNEL_IV_SIZE];
  std::memset(iv, ivByte, sizeof(iv));
  std::vector<uint8_t> output(brln::sealedLength(message.size()));
  assert(brln::seal(channel, iv, (const uint8_t *)message.data(), message.size(), output.data(), output.size()));
  return output;
}
}  // namespace

int main() {
  assert(wally_init(0) == WALLY_OK);
  uint8_t shared[32], hostKey[64], deviceKey[64], sas[4], hostSas[4];
  std::memset(shared, 0x11, sizeof(shared));
  std::memset(hostKey, 0x22, sizeof(hostKey));
  std::memset(deviceKey, 0x33, sizeof(deviceKey));
  brln::Channel device = {}, host = {};
  assert(brln::deriveChannel(shared, hostKey, deviceKey, true, &device, sas));
  assert(brln::deriveChannel(shared, hostKey, deviceKey, false, &host, hostSas));
  char code[10];
  brln::formatSas(sas, code);
  assert(std::string(code) == "B971 626B" && std::memcmp(sas, hostSas, sizeof(sas)) == 0);

  // Firmware and browser produce identical frames in both directions.
  assert(hex(sealText(&host, 0x44, "/capabilities")) == HOST_FIRST);
  assert(hex(sealText(&host, 0x45, "/xpub Mainnet m/84h/0h/0h")) == HOST_SECOND);
  assert(hex(sealText(&device, 0x55, "/capabilities brln-3")) == DEVICE_FIRST);

  // The device accepts the browser's frames only once, in order and untampered.
  brln::Channel receiver = {};
  assert(brln::deriveChannel(shared, hostKey, deviceKey, true, &receiver, sas));
  std::string message;
  assert(!openText(&receiver, bytes(HOST_SECOND), &message));  // Out of order.
  assert(openText(&receiver, bytes(HOST_FIRST), &message) && message == "/capabilities");
  assert(!openText(&receiver, bytes(HOST_FIRST), &message));  // Replay.
  for (size_t position : {0u, 20u, 80u}) {
    std::vector<uint8_t> tampered = bytes(HOST_SECOND);
    tampered[position] ^= 1;
    assert(!openText(&receiver, tampered, &message));
  }
  std::vector<uint8_t> truncated = bytes(HOST_SECOND);
  truncated.resize(truncated.size() - 16);
  assert(!openText(&receiver, truncated, &message));
  assert(openText(&receiver, bytes(HOST_SECOND), &message) && message == "/xpub Mainnet m/84h/0h/0h");
  // A frame sealed for the other direction never authenticates.
  assert(!openText(&receiver, bytes(DEVICE_FIRST), &message));

  // Long messages (signed PSBT responses) round-trip.
  brln::Channel sender = {};
  assert(brln::deriveChannel(shared, hostKey, deviceKey, false, &sender, sas));
  brln::Channel longReceiver = {};
  assert(brln::deriveChannel(shared, hostKey, deviceKey, true, &longReceiver, sas));
  const std::string longMessage = "/sign 1 " + std::string(20000, 'Q');
  assert(openText(&longReceiver, sealText(&sender, 0x66, longMessage), &message) && message == longMessage);

  brln::clearChannel(&device);
  assert(!device.active);
  assert(wally_cleanup(0) == WALLY_OK);
  std::cout << "BRLN channel passed: browser vectors, order, replay, tamper, direction\n";
}
