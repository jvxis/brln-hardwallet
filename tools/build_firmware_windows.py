"""Native Windows Arduino CLI build without shell argument re-interpretation."""
import argparse
import pathlib
import subprocess

p = argparse.ArgumentParser()
p.add_argument('--cli', default='arduino-cli')
p.add_argument('--config', required=True)
p.add_argument('--source', type=pathlib.Path, required=True)
p.add_argument('--build', required=True)
a = p.parse_args()
root = a.source.resolve().as_posix()
vendor = root + '/libraries/libwally/vendor'
flags = '-MMD -c -DWALLY_CORE_BUILD=1 -DBUILD_MINIMAL=1 -DWALLY_ABI_NO_ELEMENTS=1 -DECMULT_WINDOW_SIZE=4 -DCOMB_BLOCKS=2 -DCOMB_TEETH=5 -fno-strict-aliasing'
for suffix in ['', '/src', '/include', '/src/ccan', '/src/secp256k1/include']:
    flags += ' -I' + vendor + suffix
cpp = flags + ' -DBOWSER_BOARD_PROFILE=boards/brln_tdisplay/profile.h -DBOWSER_DISPLAY_BACKEND=display_backends/tft_espi.h -DTFT_ESPI_USER_SETUP_PATH="' + root + '/wallet/boards/brln_tdisplay/tft_setup.h"'
raise SystemExit(subprocess.call([a.cli, '--config-file', a.config, 'compile', '--fqbn', 'esp32:esp32:ttgo-lora32', '--libraries', root+'/libraries', '--build-path', a.build, '--build-property', 'compiler.c.extra_flags='+flags, '--build-property', 'compiler.cpp.extra_flags='+cpp, root+'/wallet']))
