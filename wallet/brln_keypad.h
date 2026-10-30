#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>

// Restore with the computer keypad. The Signer shows a 3x3 grid of letter
// groups, reshuffled for every letter; the host only learns the clicked cell.
// Natively tested by tests/brln_keypad_test.cpp.
namespace brln {
const char *const KEYPAD_GROUPS[9] = {"abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwx", "yz"};
const int KEYPAD_BACK = -1, KEYPAD_DONE = -2, KEYPAD_CANCEL = -3, KEYPAD_INVALID = 0;
const size_t KEYPAD_MAX_LETTERS = 8; // The longest BIP39 English word.

inline int keypadGroup(char letter) {
  if (letter < 'a' || letter > 'z') return -1;
  for (int group = 0; group < 9; group++)
    if (std::strchr(KEYPAD_GROUPS[group], letter)) return group;
  return -1;
}

// "/brln-key <data>": a cell 1-9 (row by row), back, done or cancel.
inline int keypadKey(const char *data) {
  if (data[0] >= '1' && data[0] <= '9' && data[1] == 0) return data[0] - '0';
  if (!std::strcmp(data, "back")) return KEYPAD_BACK;
  if (!std::strcmp(data, "done")) return KEYPAD_DONE;
  if (!std::strcmp(data, "cancel")) return KEYPAD_CANCEL;
  return KEYPAD_INVALID;
}

// Unbiased Fisher-Yates shuffle: cell c shows group cells[c].
template <typename Random> void keypadShuffle(uint8_t cells[9], Random random) {
  for (uint8_t i = 0; i < 9; i++) cells[i] = i;
  for (uint32_t i = 8; i > 0; i--) {
    const uint32_t range = i + 1, limit = UINT32_MAX - UINT32_MAX % range;
    uint32_t sample;
    do sample = random(); while (sample >= limit);
    const uint32_t j = sample % range;
    const uint8_t swap = cells[i]; cells[i] = cells[j]; cells[j] = swap;
  }
}

inline bool keypadMatches(const char *word, const uint8_t *groups, size_t count, bool exact) {
  size_t length = std::strlen(word);
  if (length < count || (exact && length != count)) return false;
  for (size_t i = 0; i < count; i++)
    if (keypadGroup(word[i]) != groups[i]) return false;
  return true;
}

// Words of the list whose letters fall in the typed groups: every word that
// starts that way, or with exact only the words of exactly that length. Fills
// up to maximum indexes and returns the full count.
template <typename WordAt>
size_t keypadCandidates(const uint8_t *groups, size_t count, bool exact, WordAt wordAt,
                        int *found, size_t maximum) {
  size_t total = 0;
  for (int index = 0; index < 2048; index++) {
    const char *word = wordAt(index);
    if (!word || !keypadMatches(word, groups, count, exact)) continue;
    if (total < maximum) found[total] = index;
    total++;
  }
  return total;
}
}
