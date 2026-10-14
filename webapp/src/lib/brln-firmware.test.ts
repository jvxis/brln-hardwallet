import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { FIRMWARE_ROOT, identifyBoard, loadFirmware, validateManifest, writeFirmware, type FirmwareBundle, type FirmwareLoader } from './brln-firmware'

function fixture(): FirmwareBundle {
  const paths = ['bootloader.bin', 'partitions.bin', 'boot_app0.bin', 'firmware.bin']
  const offsets = [0x1000, 0x8000, 0xe000, 0x10000]
  const binaries = paths.map((_, i) => new Uint8Array(16).fill(i))
  return { manifest: { schema: 1, board: 'brln_tdisplay', chip: 'ESP32', flash_size: 4194304,
    version: '0.1.0-brln', source_commit: 'a'.repeat(40), parts: paths.map((path, i) => ({
      path, offset: offsets[i], size: 16, sha256: createHash('sha256').update(binaries[i]).digest('hex'),
      md5: createHash('md5').update(binaries[i]).digest('hex'),
    })) }, binaries }
}
function fakeLoader(bundle = fixture()) {
  return { chip: { CHIP_NAME: 'ESP32' }, secureDownloadMode: false as boolean,
    detectChip: vi.fn().mockResolvedValue(undefined), runStub: vi.fn().mockResolvedValue(undefined),
    detectFlashSize: vi.fn().mockResolvedValue('4MB'), writeFlash: vi.fn().mockResolvedValue(undefined),
    flashMd5sum: vi.fn(async (offset: number) => bundle.manifest.parts.find(part => part.offset === offset)!.md5),
    after: vi.fn().mockResolvedValue(undefined),
  } satisfies FirmwareLoader
}
afterEach(() => vi.unstubAllGlobals())
describe('browser firmware boundary', () => {
  it.each(['ESP32-S3', 'ESP32-C3', 'ESP8266'])('rejects %s before loading a stub or writing', async chip => {
    const loader = fakeLoader(); loader.chip.CHIP_NAME = chip
    await expect(identifyBoard(loader)).rejects.toThrow('incompatível')
    expect(loader.runStub).not.toHaveBeenCalled(); expect(loader.writeFlash).not.toHaveBeenCalled()
  })
  it('rejects secure download mode and unsupported flash size', async () => {
    const loader = fakeLoader(); loader.secureDownloadMode = true
    await expect(identifyBoard(loader)).rejects.toThrow()
    loader.secureDownloadMode = false; loader.detectFlashSize.mockResolvedValue('2MB')
    await expect(identifyBoard(loader)).rejects.toThrow('4 MB')
    expect(loader.writeFlash).not.toHaveBeenCalled()
  })
  it('identification never writes flash', async () => {
    const loader = fakeLoader(); await identifyBoard(loader)
    expect(loader.detectChip).toHaveBeenCalledWith('default_reset', 3)
    expect(loader.writeFlash).not.toHaveBeenCalled()
  })
  it('rejects remote paths, writable wallet addresses, overlaps and oversized parts', () => {
    for (const patch of [{path: 'https://attacker.invalid/firmware.bin'}, {path: '../firmware.bin'},
      {offset: 0x290000}, {offset: 0x8000}, {size: 0x140004}, {size: 3}]) {
      const bundle = fixture(); Object.assign(bundle.manifest.parts[3], patch)
      expect(() => validateManifest(bundle.manifest)).toThrow()
    }
  })
  it('checks ALL binary hashes before any write', async () => {
    const bundle = fixture(), loader = fakeLoader(bundle)
    bundle.binaries[3][0] ^= 1
    await expect(writeFirmware(loader, bundle, vi.fn())).rejects.toThrow('SHA-256')
    expect(loader.writeFlash).not.toHaveBeenCalled(); expect(loader.after).not.toHaveBeenCalled()
  })
  it('writes fixed ranges without full erase or image rewriting and verifies every part before reset', async () => {
    const bundle = fixture(), loader = fakeLoader(bundle), progress = vi.fn()
    await writeFirmware(loader, bundle, progress)
    expect(loader.writeFlash).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      eraseAll: false, flashMode: 'keep', flashSize: 'keep', flashFreq: 'keep', compress: true,
      fileArray: bundle.manifest.parts.map((part, i) => ({ address: part.offset, data: bundle.binaries[i] })),
    }))
    expect(loader.flashMd5sum).toHaveBeenCalledTimes(4)
    expect(loader.after.mock.invocationCallOrder[0]).toBeGreaterThan(loader.flashMd5sum.mock.invocationCallOrder[3])
    expect(progress).toHaveBeenLastCalledWith(100)
  })
  it('does not report success or boot the wallet after a verification failure', async () => {
    const loader = fakeLoader(), progress = vi.fn(); loader.flashMd5sum.mockResolvedValue('0'.repeat(32))
    await expect(writeFirmware(loader, fixture(), progress)).rejects.toThrow('verificação')
    expect(loader.after).not.toHaveBeenCalled(); expect(progress).not.toHaveBeenCalledWith(100)
  })
  it('does not retry a disconnected write automatically', async () => {
    const loader = fakeLoader(); loader.writeFlash.mockRejectedValue(new Error('disconnected'))
    await expect(writeFirmware(loader, fixture(), vi.fn())).rejects.toThrow('disconnected')
    expect(loader.writeFlash).toHaveBeenCalledTimes(1); expect(loader.after).not.toHaveBeenCalled()
  })
  it('loads only same-origin packaged files, with credentials and no redirects', async () => {
    const bundle = fixture()
    const fetcher = vi.fn(async (path: string) => new Response(path.endsWith('manifest.json')
      ? JSON.stringify(bundle.manifest) : new Uint8Array(bundle.binaries[bundle.manifest.parts.findIndex(p => path.endsWith(p.path))])))
    vi.stubGlobal('fetch', fetcher)
    expect((await loadFirmware()).manifest).toEqual(bundle.manifest)
    for (const call of fetcher.mock.calls) expect(call[0].startsWith(FIRMWARE_ROOT)).toBe(true)
    expect(fetcher).toHaveBeenCalledWith(FIRMWARE_ROOT + 'manifest.json', expect.objectContaining({credentials: 'same-origin', redirect: 'error'}))
  })
  it('rejects an expired session and a truncated download', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', {status: 401})))
    await expect(loadFirmware()).rejects.toThrow('sessão')
    const bundle = fixture()
    vi.stubGlobal('fetch', vi.fn(async (path: string) => new Response(path.endsWith('manifest.json') ? JSON.stringify(bundle.manifest) : new Uint8Array(4))))
    await expect(loadFirmware()).rejects.toThrow('Tamanho')
  })
})
