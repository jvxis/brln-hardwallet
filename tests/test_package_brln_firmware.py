import hashlib
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from package_brln_firmware import package


class BrowserPackageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.build = self.root / 'build'
        self.build.mkdir()
        app = bytearray(64)
        app[0], app[23] = 0xE9, 1
        (self.build / 'wallet.ino.bin').write_bytes(app + hashlib.sha256(app).digest())
        (self.build / 'wallet.ino.bootloader.bin').write_bytes(bytes([0xE9, 0, 0, 0]))
        entries = [(1, 2, 0x9000, 0x5000), (1, 0, 0xE000, 0x2000),
                   (0, 16, 0x10000, 0x140000), (0, 17, 0x150000, 0x140000),
                   (1, 130, 0x290000, 0x160000), (1, 3, 0x3F0000, 0x10000)]
        partitions = b''.join(struct.pack('<HBBII16sI', 0x50AA, *e, b'fixture', 0) for e in entries)
        (self.build / 'wallet.ino.partitions.bin').write_bytes(partitions)
        self.boot = self.root / 'boot_app0.bin'
        self.boot.write_bytes(b'\xff' * 8192)
        self.output = self.root / 'output'

    def run_package(self, **changes):
        args = dict(build=self.build, boot_app0=self.boot, output=self.output, commit='a'*40, version='0.1.0-brln')
        return package(**(args | changes))

    def test_binds_hashes_and_layout_to_source(self):
        manifest = self.run_package()
        self.assertEqual(manifest['source_commit'], 'a'*40)
        self.assertEqual([p['offset'] for p in manifest['parts']], [4096, 32768, 57344, 65536])
        for part in manifest['parts']:
            data = (self.output / part['path']).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), part['sha256'])
            self.assertEqual(hashlib.md5(data).hexdigest(), part['md5'])

    def test_rejects_other_partition_maps_without_publishing(self):
        path = self.build / 'wallet.ino.partitions.bin'
        data = bytearray(path.read_bytes())
        struct.pack_into('<I', data, 4, 0x8000)
        path.write_bytes(data)
        with self.assertRaisesRegex(ValueError, 'partition'):
            self.run_package()
        self.assertFalse(self.output.exists())

    def test_rejects_oversized_bootloader_before_publishing(self):
        (self.build / 'wallet.ino.bootloader.bin').write_bytes(b'\xe9' * 0x8000)
        with self.assertRaises(ValueError):
            self.run_package()
        self.assertFalse(self.output.exists())

    def test_rejects_corrupt_application_and_upstream_version(self):
        with self.assertRaises(ValueError):
            self.run_package(version='0.8.3')
        (self.build / 'wallet.ino.bin').write_bytes(b'\xe9' * 96)
        with self.assertRaises(ValueError):
            self.run_package()
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
