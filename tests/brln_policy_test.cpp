#include "../wallet/brln_policy.h"
#include <cassert>
#include <initializer_list>
int main() {
  for (const char *cmd : {"/password", "/restore", "/create", "/wipe", "/seed"}) assert(brln::forbiddenHostSecretCommand(cmd));
  assert(!brln::forbiddenHostSecretCommand("/xpub"));
  assert(brln::allowedLocalCommand("/brln-create", ""));
  assert(brln::allowedLocalCommand("/brln-unlock-passphrase", ""));
  assert(!brln::allowedLocalCommand("/brln-unlock-passphrase", "secret"));
  assert(!brln::allowedLocalCommand("/brln-create", "secret"));
  assert(brln::allowedLocalCommand("/brln-restore-keypad", ""));
  assert(!brln::allowedLocalCommand("/brln-restore-keypad", "abandon"));
  // Keys are accepted only inside a keypad restore, never as a command.
  assert(!brln::allowedLocalCommand("/brln-key", "5"));
  assert(!brln::allowedLocalCommand("/brln-unknown", ""));
  assert(!brln::allowedLocalCommand("/password", ""));
}
