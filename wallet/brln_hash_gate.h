#pragma once
// A help-screen press must never approve a build; absent hashes fail closed.
enum class BrlnHashAction { Wait, Redraw, Approve };
inline BrlnHashAction brlnHashKey(char key, bool valid, bool &help) {
  if(key=='*' || (key=='#' && help)) {
    help=!help;
    return BrlnHashAction::Redraw;
  }
  return key=='#' && valid ? BrlnHashAction::Approve : BrlnHashAction::Wait;
}
