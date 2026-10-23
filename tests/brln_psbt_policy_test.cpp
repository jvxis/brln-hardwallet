#include <cassert>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <vector>

extern "C" {
#include "libwally.h"
}
#include "../wallet/brln_psbt_policy.h"

namespace {
const uint32_t H = BIP32_INITIAL_HARDENED_CHILD;
struct ext_key root = {};
struct ext_key foreign = {};

struct Path {
  std::vector<uint32_t> items;
};
Path account(uint32_t branch, uint32_t index, uint32_t accountIndex = 0, uint32_t purpose = 84) {
  return {{purpose | H, 0 | H, accountIndex | H, branch, index}};
}

struct ext_key derive(const struct ext_key &parent, const Path &path) {
  struct ext_key child = {};
  assert(bip32_key_from_parent_path(&parent, path.items.data(), path.items.size(),
                                    BIP32_FLAG_KEY_PRIVATE, &child) == WALLY_OK);
  return child;
}

std::vector<unsigned char> p2wpkh(const struct ext_key &key) {
  std::vector<unsigned char> script(WALLY_SCRIPTPUBKEY_P2WPKH_LEN);
  size_t written = 0;
  assert(wally_witness_program_from_bytes(key.pub_key, EC_PUBLIC_KEY_LEN, WALLY_SCRIPT_HASH160,
                                          script.data(), script.size(), &written) == WALLY_OK);
  return script;
}

struct Input {
  Path path;
  const struct ext_key *owner;
  bool secondKeypath;
};
struct Output {
  Path path;  // Empty: external destination without keypath.
  const struct ext_key *owner;
  bool foreignScript;  // Keypath present but script pays someone else.
};

void addKeypath(struct wally_map *map, const struct ext_key &key, const struct ext_key &owner, const Path &path) {
  if (map->items == NULL) assert(wally_map_init(2, wally_keypath_public_key_verify, map) == WALLY_OK);
  assert(wally_map_keypath_add(map, key.pub_key, EC_PUBLIC_KEY_LEN, owner.hash160, BIP32_KEY_FINGERPRINT_LEN,
                               path.items.data(), path.items.size()) == WALLY_OK);
}

struct wally_psbt *build(uint32_t version, const std::vector<Input> &inputs,
                         const std::vector<Output> &outputs) {
  struct wally_tx *tx = NULL;
  assert(wally_tx_init_alloc(WALLY_TX_VERSION_2, 0, inputs.size(), outputs.size(), &tx) == WALLY_OK);
  for (size_t i = 0; i < inputs.size(); i++) {
    unsigned char txid[WALLY_TXHASH_LEN] = {0};
    txid[0] = (unsigned char)(i + 1);
    assert(wally_tx_add_raw_input(tx, txid, sizeof(txid), 0, WALLY_TX_SEQUENCE_FINAL, NULL, 0, NULL, 0) == WALLY_OK);
  }
  const std::vector<unsigned char> external = p2wpkh(derive(foreign, account(0, 0)));
  std::vector<struct ext_key> outputKeys;
  for (const Output &output : outputs) {
    std::vector<unsigned char> script = external;
    if (!output.path.items.empty()) {
      outputKeys.push_back(derive(*output.owner, output.path));
      if (!output.foreignScript) script = p2wpkh(outputKeys.back());
    } else {
      outputKeys.push_back({});
    }
    assert(wally_tx_add_raw_output(tx, 10000, script.data(), script.size(), 0) == WALLY_OK);
  }
  struct wally_psbt *psbt = NULL;
  assert(wally_psbt_from_tx(tx, version, 0, &psbt) == WALLY_OK);
  wally_tx_free(tx);
  for (size_t i = 0; i < inputs.size(); i++) {
    const struct ext_key key = derive(*inputs[i].owner, inputs[i].path);
    const std::vector<unsigned char> script = p2wpkh(key);
    struct wally_tx_output *utxo = NULL;
    assert(wally_tx_output_init_alloc(30000, script.data(), script.size(), &utxo) == WALLY_OK);
    assert(wally_psbt_set_input_witness_utxo(psbt, i, utxo) == WALLY_OK);
    wally_tx_output_free(utxo);
    assert(wally_map_clear(&psbt->inputs[i].keypaths) == WALLY_OK);
    addKeypath(&psbt->inputs[i].keypaths, key, *inputs[i].owner, inputs[i].path);
    if (inputs[i].secondKeypath) {
      const Path other = account(0, 9);
      const struct ext_key extra = derive(root, other);
      addKeypath(&psbt->inputs[i].keypaths, extra, root, other);
    }
  }
  for (size_t i = 0; i < outputs.size(); i++) {
    if (outputs[i].path.items.empty()) continue;
    assert(wally_map_clear(&psbt->outputs[i].keypaths) == WALLY_OK);
    addKeypath(&psbt->outputs[i].keypaths, outputKeys[i], *outputs[i].owner, outputs[i].path);
  }
  return psbt;
}

void expect(uint32_t version, const std::vector<Input> &inputs, const std::vector<Output> &outputs,
            const char *error, const std::vector<bool> &change) {
  struct wally_psbt *psbt = build(version, inputs, outputs);
  const char *actual = brln::psbtScopeError(psbt, &root);
  if ((error == NULL) != (actual == NULL) || (error && std::strcmp(error, actual))) {
    std::cerr << "expected " << (error ? error : "accept") << ", got " << (actual ? actual : "accept") << "\n";
    assert(false);
  }
  for (size_t i = 0; i < change.size(); i++) assert(brln::isAccountChange(psbt, i, &root) == change[i]);
  wally_psbt_free(psbt);
}
}  // namespace

int main() {
  assert(wally_init(0) == WALLY_OK);
  const unsigned char seed[32] = {7}, otherSeed[32] = {9};
  assert(bip32_key_from_seed(seed, sizeof(seed), BIP32_VER_MAIN_PRIVATE, 0, &root) == WALLY_OK);
  assert(bip32_key_from_seed(otherSeed, sizeof(otherSeed), BIP32_VER_MAIN_PRIVATE, 0, &foreign) == WALLY_OK);
  const Input owned = {account(0, 3), &root, false};
  const Output destination = {{}, NULL, false};
  for (uint32_t version : {WALLY_PSBT_VERSION_0, WALLY_PSBT_VERSION_2}) {
    // The coordinator's shapes: payment with change, and send-all without change.
    expect(version, {owned, {account(1, 4), &root, false}}, {destination, {account(1, 2), &root, false}}, NULL, {false, true});
    expect(version, {owned}, {destination}, NULL, {false});
    expect(version, {{account(1, 499), &root, false}}, {destination, {account(1, 499), &root, false}}, NULL, {false, true});
    // Change outside the rediscoverable account is a second destination, never "change" (#1).
    for (const Path &path : {account(1, 500), account(1, 0x7fffff00), account(1, 0, 7), account(0, 1),
                             account(1, 0, 0, 49), Path{{84 | H, 0 | H, 0 | H, 1}}}) {
      expect(version, {owned}, {destination, {path, &root, false}}, "BRLN: one destination", {false, false});
    }
    expect(version, {owned}, {destination, {account(1, 2), &foreign, false}}, "BRLN: one destination", {false, false});
    expect(version, {owned}, {destination, {account(1, 2), &root, true}}, "BRLN: one destination", {false, false});
    expect(version, {owned}, {{account(1, 2), &root, false}}, "BRLN: one destination", {true});
    // Inputs are limited to the account's P2WPKH keys (#4).
    for (const Input &input : {Input{account(0, 0, 0, 44), &root, false}, Input{account(0, 0, 1), &root, false},
                               Input{account(0, 500), &root, false}, Input{account(0, 1), &foreign, false},
                               Input{account(0, 1), &root, true}}) {
      expect(version, {input}, {destination}, "BRLN: BIP84 inputs only", {});
    }
    std::vector<Input> twenty(20, owned), twentyOne(21, owned);
    expect(version, twenty, {destination}, NULL, {});
    expect(version, twentyOne, {destination}, "BRLN: 1-20 inputs", {});
    expect(version, {owned}, {destination, destination, {account(1, 2), &root, false}}, "BRLN: 1-2 outputs", {});
  }
  wally_bzero(&root, sizeof(root));
  wally_bzero(&foreign, sizeof(foreign));
  assert(wally_cleanup(0) == WALLY_OK);
  std::cout << "BRLN PSBT scope passed: BIP84 account inputs, rediscoverable change, one destination\n";
}
