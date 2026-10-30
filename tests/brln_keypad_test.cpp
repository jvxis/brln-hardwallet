#include <wally_bip39.h>
#include <wally_core.h>
#include "../wallet/brln_keypad.h"
#include <cassert>
#include <cstdio>
#include <cstring>
#include <initializer_list>

static const char *wordAt(int index) { return bip39_get_word_by_index(NULL, index); }

// Mirrors the firmware loop: one cell per letter until a single word remains,
// or the whole word followed by "done" and a choice among the exact matches.
static void enterEveryWord() {
  size_t automatic = 0, exactOne = 0, choices = 0, longest = 0;
  for (int index = 0; index < 2048; index++) {
    const char *word = wordAt(index);
    uint8_t groups[brln::KEYPAD_MAX_LETTERS];
    size_t count = 0;
    int found[4];
    bool resolved = false;
    for (size_t i = 0; word[i] && !resolved; i++) {
      assert(count < brln::KEYPAD_MAX_LETTERS);
      groups[count++] = uint8_t(brln::keypadGroup(word[i]));
      size_t total = brln::keypadCandidates(groups, count, false, wordAt, found, 4);
      assert(total >= 1);
      if (total == 1) { assert(found[0] == index); resolved = true; automatic++; }
    }
    if (!resolved) {
      size_t total = brln::keypadCandidates(groups, count, true, wordAt, found, 4);
      assert(total >= 1 && total <= 3);
      bool listed = false;
      for (size_t i = 0; i < total; i++) listed = listed || found[i] == index;
      assert(listed);
      total == 1 ? exactOne++ : choices++;
    }
    if (count > longest) longest = count;
  }
  assert(automatic + exactOne + choices == 2048 && longest <= brln::KEYPAD_MAX_LETTERS);
  std::printf("keypad: %zu automatic, %zu exact, %zu device choices\n", automatic, exactOne, choices);
}

// xorshift32: a fixed, well-mixed test stream (the device uses esp_random).
static uint32_t state = 2463534242u;
static uint32_t counter() { state ^= state << 13; state ^= state >> 17; state ^= state << 5; return state; }

int main() {
  assert(wally_init(0) == WALLY_OK);
  for (char c = 'a'; c <= 'z'; c++) assert(brln::keypadGroup(c) >= 0);
  assert(brln::keypadGroup('A') == -1 && brln::keypadGroup(' ') == -1);
  enterEveryWord();

  assert(brln::keypadKey("1") == 1 && brln::keypadKey("9") == 9);
  assert(brln::keypadKey("back") == brln::KEYPAD_BACK && brln::keypadKey("done") == brln::KEYPAD_DONE);
  assert(brln::keypadKey("cancel") == brln::KEYPAD_CANCEL);
  for (const char *bad : {"", "0", "10", "a", " 1", "1 ", "abandon", "back "}) assert(brln::keypadKey(bad) == brln::KEYPAD_INVALID);

  // Every shuffle is a permutation, and over many draws each group lands in
  // every cell (a uniform 9-cell shuffle; the RNG itself is tested elsewhere).
  unsigned seen[9][9] = {};
  for (int draw = 0; draw < 9000; draw++) {
    uint8_t cells[9];
    brln::keypadShuffle(cells, counter);
    bool used[9] = {};
    for (int c = 0; c < 9; c++) { assert(cells[c] < 9 && !used[cells[c]]); used[cells[c]] = true; seen[c][cells[c]]++; }
  }
  for (int c = 0; c < 9; c++) for (int g = 0; g < 9; g++) assert(seen[c][g] > 700 && seen[c][g] < 1300);
  // A rejected sample is drawn again, so a constant-at-limit RNG cannot bias it.
  uint32_t values[] = {UINT32_MAX, 5, UINT32_MAX, 0, 0, 0, 0, 0, 0, 0}; size_t next = 0;
  uint8_t cells[9];
  brln::keypadShuffle(cells, [&]() { return values[next++ % 10]; });
  bool used[9] = {};
  for (int c = 0; c < 9; c++) { assert(!used[cells[c]]); used[cells[c]] = true; }
  wally_cleanup(0);
}
