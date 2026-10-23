#pragma once
// BRLN signing scope: the single mainnet BIP84 account used by the coordinator.
// Include libwally before this header. Natively tested by tests/brln_psbt_policy_test.cpp.
#include <cstring>

namespace brln {
const uint32_t HARDENED = 0x80000000u;
// Must match the coordinator's discovery limit (webapp/src/lib/brln-wallet.ts).
const uint32_t ACCOUNT_INDEX_LIMIT = 500;
const size_t PSBT_MAX_INPUTS = 20;
const size_t PSBT_MAX_OUTPUTS = 2;

// Require exactly one keypath, derived from `root`, at m/84'/0'/0'/branch/index.
// Change paths are always accepted; receive paths only when allowReceive is set.
inline bool accountKey(const struct wally_map *keypaths, const struct ext_key *root,
                       bool allowReceive, struct ext_key *derived) {
  memset(derived, 0, sizeof(*derived));
  if (keypaths == NULL || root == NULL || keypaths->num_items != 1) return false;
  size_t found = 0;
  if (wally_map_keypath_get_bip32_public_key_from(keypaths, 0, root, derived, &found) != WALLY_OK ||
      found != 1) {
    wally_bzero(derived, sizeof(*derived));
    return false;
  }
  uint32_t path[5] = {0};
  size_t length = 0;
  const bool valid =
    wally_map_keypath_get_item_path(keypaths, 0, path, 5, &length) == WALLY_OK && length == 5 &&
    path[0] == HARDENED + 84 && path[1] == HARDENED && path[2] == HARDENED &&
    (path[3] == 1 || (allowReceive && path[3] == 0)) && path[4] < ACCOUNT_INDEX_LIMIT;
  if (!valid) wally_bzero(derived, sizeof(*derived));
  return valid;
}

inline bool scriptIsP2wpkhFor(const struct ext_key *key, const unsigned char *script, size_t length) {
  unsigned char expected[WALLY_SCRIPTPUBKEY_P2WPKH_LEN] = {0};
  size_t expectedLength = 0;
  return length == WALLY_SCRIPTPUBKEY_P2WPKH_LEN &&
         wally_witness_program_from_bytes(key->pub_key, EC_PUBLIC_KEY_LEN, WALLY_SCRIPT_HASH160,
                                          expected, sizeof(expected), &expectedLength) == WALLY_OK &&
         expectedLength == length && memcmp(expected, script, length) == 0;
}

// Change is only what this coordinator can rediscover: P2WPKH on the account's
// change branch below the discovery limit. Anything else is shown as a destination.
inline bool isAccountChange(const struct wally_psbt *psbt, size_t index, const struct ext_key *root) {
  if (psbt == NULL || index >= psbt->num_outputs) return false;
  unsigned char script[WALLY_SCRIPTPUBKEY_P2WPKH_LEN] = {0};
  size_t length = 0;
  if (wally_psbt_get_output_script(psbt, index, script, sizeof(script), &length) != WALLY_OK ||
      length != sizeof(script)) return false;
  struct ext_key key;
  const bool change = accountKey(&psbt->outputs[index].keypaths, root, false, &key) &&
                      scriptIsP2wpkhFor(&key, script, length);
  wally_bzero(&key, sizeof(key));
  return change;
}

// Returns NULL when the PSBT fits the BRLN scope, otherwise a fixed reason.
inline const char *psbtScopeError(const struct wally_psbt *psbt, const struct ext_key *root) {
  if (psbt == NULL || root == NULL) return "Invalid PSBT";
  if (psbt->num_inputs == 0 || psbt->num_inputs > PSBT_MAX_INPUTS) return "BRLN: 1-20 inputs";
  if (psbt->num_outputs == 0 || psbt->num_outputs > PSBT_MAX_OUTPUTS) return "BRLN: 1-2 outputs";
  for (size_t i = 0; i < psbt->num_inputs; i++) {
    const struct wally_tx_output *utxo = NULL;
    if (wally_psbt_get_input_best_utxo(psbt, i, &utxo) != WALLY_OK || utxo == NULL)
      return "Input UTXO missing";
    const struct wally_psbt_input *input = &psbt->inputs[i];
    if (input->taproot_leaf_paths.num_items != 0) return "BRLN: BIP84 inputs only";
    struct ext_key key;
    const bool owned = accountKey(&input->keypaths, root, true, &key) &&
                       scriptIsP2wpkhFor(&key, utxo->script, utxo->script_len);
    wally_bzero(&key, sizeof(key));
    if (!owned) return "BRLN: BIP84 inputs only";
  }
  size_t destinations = 0;
  for (size_t i = 0; i < psbt->num_outputs; i++)
    if (!isAccountChange(psbt, i, root)) destinations++;
  if (destinations != 1) return "BRLN: one destination";
  return NULL;
}
}  // namespace brln
