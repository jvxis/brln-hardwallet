"""Package only the BRLN original T-Display build for the local LOS installer."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

from esp_image_hash import esp_image_hash

PARTS = (
    ('bootloader.bin', 'wallet.ino.bootloader.bin', 0x1000, 0x7000),
    ('partitions.bin', 'wallet.ino.partitions.bin', 0x8000, 0x1000),
    ('boot_app0.bin', None, 0xE000, 0x2000),
    ('firmware.bin', 'wallet.ino.bin', 0x10000, 0x140000),
)


def package(build: Path, boot_app0: Path, output: Path, commit: str, version: str):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('A full source commit is required')
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+-brln', version):
        raise ValueError('Not a BRLN firmware version')
    esp_image_hash(build / 'wallet.ino.bin')
    # Reject an unexpected partition layout: the installer never writes NVS or SPIFFS.
    partition_bytes = (build / 'wallet.ino.partitions.bin').read_bytes()
    entries = []
    for pos in range(0, len(partition_bytes) - 31, 32):
        magic, kind, subtype, offset, size, label, flags = struct.unpack_from('<HBBII16sI', partition_bytes, pos)
        if magic != 0x50AA:
            break
        entries.append((kind, subtype, offset, size))
    expected = [(1, 2, 0x9000, 0x5000), (1, 0, 0xE000, 0x2000),
                (0, 16, 0x10000, 0x140000), (0, 17, 0x150000, 0x140000),
                (1, 130, 0x290000, 0x160000), (1, 3, 0x3F0000, 0x10000)]
    if entries != expected:
        raise ValueError('Unexpected BRLN partition layout')
    manifest = dict(schema=1, board='brln_tdisplay', chip='ESP32', flash_size=4194304,
                    version=version, source_commit=commit, parts=[])
    binaries = {}
    for name, source, offset, maximum in PARTS:
        data = ((build / source) if source else boot_app0).read_bytes()
        if not data or len(data) > maximum or len(data) % 4:
            raise ValueError('Invalid firmware part: ' + name)
        if name in ('bootloader.bin', 'firmware.bin') and data[0] != 0xE9:
            raise ValueError('Invalid ESP image: ' + name)
        binaries[name] = data
        manifest['parts'].append(dict(path=name, offset=offset, size=len(data),
                                     sha256=hashlib.sha256(data).hexdigest(),
                                     md5=hashlib.md5(data, usedforsecurity=False).hexdigest()))
    # Validate everything before publishing; CI always uses a fresh output directory.
    output.mkdir(parents=True, exist_ok=True)
    for name, data in binaries.items():
        (output / name).write_bytes(data)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (output / 'SHA256SUMS').write_text(''.join(f'{p["sha256"]}  {p["path"]}\n' for p in manifest['parts']), encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', required=True, type=Path)
    parser.add_argument('--boot-app0', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    package(args.build, args.boot_app0, args.output, args.commit, args.version)
