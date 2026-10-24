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
  it('supports the original 16 MB T-Display without expanding or rewriting the 4 MB image', async () => {
    const bundle = fixture(), loader = fakeLoader(bundle)
    loader.detectFlashSize.mockResolvedValue('16MB')
    await expect(identifyBoard(loader)).resolves.toBe('16MB')
    expect(loader.writeFlash).not.toHaveBeenCalled()
    await writeFirmware(loader, bundle, vi.fn())
    expect(loader.writeFlash).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      flashSize: 'keep', eraseAll: false,
      fileArray: bundle.manifest.parts.map((part, i) => ({ address: part.offset, data: bundle.binaries[i] })),
    }))
    expect(loader.flashMd5sum).toHaveBeenCalledTimes(4)
  })
  it.each(['2MB', '8MB', '32MB', undefined])('rejects unsupported capacity %s before writing', async size => {
    const loader = fakeLoader(); loader.detectFlashSize.mockResolvedValue(size)
    await expect(identifyBoard(loader)).rejects.toThrow()
    await expect(writeFirmware(loader, fixture(), vi.fn())).rejects.toThrow()
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
  it('erases the whole chip on request and confirms the wallet areas read back erased', async () => {
    const { WALLET_DATA_REGIONS } = await import('./brln-firmware')
    for (const region of WALLET_DATA_REGIONS)
      expect(createHash('md5').update(Buffer.alloc(region.size, 0xff)).digest('hex')).toBe(region.erasedMd5)
    const bundle = fixture(), loader = fakeLoader(bundle)
    const erased = (offset: number) => WALLET_DATA_REGIONS.find(region => region.offset === offset)?.erasedMd5
    loader.flashMd5sum.mockImplementation(async (offset: number) => erased(offset) ?? bundle.manifest.parts.find(part => part.offset === offset)!.md5)
    await writeFirmware(loader, bundle, vi.fn(), { eraseAll: true })
    expect(loader.writeFlash).toHaveBeenCalledWith(expect.objectContaining({ eraseAll: true }))
    expect(loader.flashMd5sum).toHaveBeenCalledWith(0x9000, 0x5000)
    expect(loader.flashMd5sum).toHaveBeenCalledWith(0x290000, 0x160000)
    expect(loader.after).toHaveBeenCalledOnce()
  })
  it('does not boot a board whose wallet area was not erased', async () => {
    const bundle = fixture(), loader = fakeLoader(bundle)
    loader.flashMd5sum.mockImplementation(async (offset: number) => bundle.manifest.parts.find(part => part.offset === offset)?.md5 ?? '0'.repeat(32))
    await expect(writeFirmware(loader, bundle, vi.fn(), { eraseAll: true })).rejects.toThrow('apagamento')
    expect(loader.after).not.toHaveBeenCalled()
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

describe('hash shown by the Signer', () => {
  it('reads the verified SHA-256 appended to the application image', async () => {
    const { espImageHash } = await import('./brln-firmware')
    const content = new Uint8Array(64).map((_, i) => i); content[0] = 0xe9; content[23] = 1
    const digest = createHash('sha256').update(content).digest()
    const image = new Uint8Array([...content, ...digest])
    expect(await espImageHash(image)).toBe(digest.toString('hex'))
    image[40] ^= 1
    await expect(espImageHash(image)).rejects.toThrow('inválido')
    content[23] = 0
    await expect(espImageHash(new Uint8Array([...content, ...digest]))).rejects.toThrow('sem hash')
  })
})

describe('reset after writing', () => {
  it('pulses EN with IO0 high so the new firmware boots instead of the flasher stub', async () => {
    const calls: Array<{ dataTerminalReady: boolean; requestToSend: boolean }> = []
    const waits: number[] = []
    const { resetToApplication } = await import('./brln-firmware')
    await resetToApplication({ setSignals: async signals => { calls.push(signals) } }, async ms => { waits.push(ms) })
    expect(calls).toEqual([{ dataTerminalReady: false, requestToSend: true }, { dataTerminalReady: false, requestToSend: false }])
    expect(waits).toEqual([100])
  })
})
