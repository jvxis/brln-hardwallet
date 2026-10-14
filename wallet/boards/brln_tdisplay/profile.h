#pragma once
#define BOWSER_BRLN 1
const BoardProfile BOARD = {
  "brln_tdisplay", "BRLN T-Display", 1, true, 0, 4, HIGH, 0, 35, false,
  false, {33,32,25}, {21,27,26,22}, false, 17,2,15,13, false,
  {false,-1,-1,-1,-1,-1,false},
  {false,-1,-1,-1,-1,0,0,false,false,false}
};
inline SPIClass &boardSdSpi() { static SPIClass spi(HSPI); return spi; }
