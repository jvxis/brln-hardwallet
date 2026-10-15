#pragma once
#include <stddef.h>
// Passwords protect persisted secrets; passphrases retain their separate policy.
inline bool brlnPasswordCanFinish(size_t length) { return length >= 12 && length <= 32; }
inline bool brlnPasswordCharacterAllowed(char value) { return value != ' '; }
