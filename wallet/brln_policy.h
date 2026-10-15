#pragma once
#include <cstring>

namespace brln {
inline bool forbiddenHostSecretCommand(const char *command) {
  return !std::strcmp(command,"/password") || !std::strcmp(command,"/restore") ||
    !std::strcmp(command,"/create") || !std::strcmp(command,"/wipe") || !std::strcmp(command,"/seed");
}
inline bool localCommand(const char *command) { return std::strncmp(command,"/brln-",6)==0; }
inline bool allowedLocalCommand(const char *command, const char *arguments) {
  if (arguments[0]) return false;
  return !std::strcmp(command,"/brln-unlock") || !std::strcmp(command,"/brln-unlock-passphrase") || !std::strcmp(command,"/brln-create") ||
    !std::strcmp(command,"/brln-restore") || !std::strcmp(command,"/brln-backup");
}
}
