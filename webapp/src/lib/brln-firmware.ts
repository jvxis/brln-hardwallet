// Only this fixed board/layout can be installed. No remote URLs or user binaries.
export const FIRMWARE_ROOT = '/firmware/brln-tdisplay/'
const layout = [
  ['bootloader.bin', 0x1000, 0x7000],
  ['partitions.bin', 0x8000, 0x1000],
  ['boot_app0.bin', 0xe000, 0x2000],
  ['firmware.bin', 0x10000, 0x140000],
] as const
export type FirmwarePart = { path: string; offset: number; size: number; sha256: string; md5: string }
export type FirmwareManifest = {
  schema: number; board: string; chip: string; flash_size: number
  version: string; source_commit: string; parts: FirmwarePart[]
}
export type FirmwareBundle = { manifest: FirmwareManifest; binaries: Uint8Array[] }

export function validateManifest(value: unknown): FirmwareManifest {
  const m = value as FirmwareManifest | null
  if (!m || m.schema !== 1 || m.board !== 'brln_tdisplay' || m.chip !== 'ESP32' ||
      m.flash_size !== 4194304 || !/^\d+\.\d+\.\d+-brln$/.test(m.version) ||
      !/^[0-9a-f]{40}$/.test(m.source_commit) || !Array.isArray(m.parts) || m.parts.length !== 4)
    throw new Error('Pacote de firmware incompatível com a T-Display original.')
  m.parts.forEach((part, index) => {
    const [path, offset, max] = layout[index]
    if (!part || part.path !== path || part.offset !== offset || !Number.isSafeInteger(part.size) ||
        part.size <= 0 || part.size > max || part.size % 4 !== 0 ||
        !/^[0-9a-f]{64}$/.test(part.sha256) || !/^[0-9a-f]{32}$/.test(part.md5))
      throw new Error('Arquivo ou endereço de gravação inválido no pacote.')
  })
  return m
}

async function readLocal(path: string, limit: number): Promise<Uint8Array> {
  const response = await fetch(FIRMWARE_ROOT + path, {
    credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000),
  })
  if (!response.ok || !response.body) throw new Error('Firmware indisponível. Confira sua sessão do BR⚡LN LightningOS e recarregue a página.')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) throw new Error('Arquivo de firmware maior que o permitido.')
      chunks.push(value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

export async function verifyBundle(bundle: FirmwareBundle): Promise<void> {
  const manifest = validateManifest(bundle.manifest)
  if (bundle.binaries.length !== manifest.parts.length) throw new Error('Pacote incompleto.')
  for (const [index, part] of manifest.parts.entries()) {
    const data = bundle.binaries[index]
    if (!(data instanceof Uint8Array) || data.length !== part.size) throw new Error('Tamanho de firmware incorreto.')
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data))
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    if (hex !== part.sha256) throw new Error('SHA-256 divergente. Nenhum firmware foi gravado.')
  }
}

// The SHA-256 appended to the application image: the 64 digits the Signer shows
// for approval on its first boot (same as tools/esp_image_hash.py).
export async function espImageHash(image: Uint8Array): Promise<string> {
  if (image.length < 56 || image[0] !== 0xe9 || image[23] !== 1) throw new Error('Imagem ESP sem hash anexado.')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', image.slice(0, -32)))
  const embedded = image.slice(-32)
  if (!digest.every((byte, index) => byte === embedded[index])) throw new Error('Hash anexado da imagem ESP inválido.')
  return Array.from(embedded, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function loadFirmware(): Promise<FirmwareBundle> {
  const manifest = validateManifest(JSON.parse(new TextDecoder().decode(await readLocal('manifest.json', 8192))))
  const binaries = await Promise.all(manifest.parts.map(part => readLocal(part.path, part.size)))
  const bundle = { manifest, binaries }
  await verifyBundle(bundle)
  return bundle
}

// The port remains exclusively owned by this session until release().
export interface FirmwareLoader {
  chip: { CHIP_NAME: string }; secureDownloadMode: boolean
  detectChip(mode: 'default_reset', attempts: number): Promise<void>
  runStub(): Promise<unknown>
  detectFlashSize(): Promise<string | undefined>
  writeFlash(options: import('esptool-js').FlashOptions): Promise<void>
  flashMd5sum(offset: number, size: number): Promise<string>
  after(mode: 'hard_reset'): Promise<void>
}

// esptool-js 0.7.0's HardReset only releases RTS (no EN pulse) and may resend a
// stale DTR, so the chip stays in the flasher stub with a dark screen. Pulse EN
// with IO0 kept high, changing both lines together like the app's pairing reset.
export type SignalPort = { setSignals(signals: { dataTerminalReady: boolean; requestToSend: boolean }): Promise<void> }
export async function resetToApplication(port: SignalPort, wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  await port.setSignals({ dataTerminalReady: false, requestToSend: true })
  await wait(100)
  await port.setSignals({ dataTerminalReady: false, requestToSend: false })
}

// Both original T-Display capacities use the SAME pinned 4 MB image/layout.
// Never enlarge partitions or rewrite image headers based on detected capacity.
function supportedFlash(size: string | undefined): size is '4MB' | '16MB' {
  return size === '4MB' || size === '16MB'
}

export async function identifyBoard(loader: FirmwareLoader): Promise<'4MB' | '16MB'> {
  await loader.detectChip('default_reset', 3)
  if (loader.chip.CHIP_NAME !== 'ESP32' || loader.secureDownloadMode)
    throw new Error('Chip incompatível. Use somente a T-Display original ESP32, não S3 ou C3.')
  await loader.runStub() // RAM only: no erase or flash write during identification.
  const size = await loader.detectFlashSize()
  if (!supportedFlash(size)) throw new Error('Esta versão exige a T-Display original com flash de 4 MB ou 16 MB.')
  return size
}

export async function writeFirmware(loader: FirmwareLoader, bundle: FirmwareBundle, progress: (percent: number) => void): Promise<void> {
  if (loader.chip.CHIP_NAME !== 'ESP32' || loader.secureDownloadMode) throw new Error('Chip incompatível.')
  await verifyBundle(bundle) // All bytes checked again before the first destructive operation.
  if (!supportedFlash(await loader.detectFlashSize())) throw new Error('Flash incompatível.')
  await loader.writeFlash({
    fileArray: bundle.manifest.parts.map((part, index) => ({ address: part.offset, data: bundle.binaries[index] })),
    flashMode: 'keep', flashFreq: 'keep', flashSize: 'keep', eraseAll: false, compress: true,
    reportProgress: (index, written, total) => progress(Math.min(90, Math.floor((index + written / total) / 4 * 90))),
  })
  // The ROM/stub MD5 checks transport integrity, not publisher authenticity.
  // SHA-256 above checks downloaded bytes. No wallet memory is read or uploaded.
  for (const [index, part] of bundle.manifest.parts.entries()) {
    if ((await loader.flashMd5sum(part.offset, part.size)).toLowerCase() !== part.md5)
      throw new Error('A verificação da gravação falhou. Não crie uma carteira; reconecte o BR⚡LN Signer e repita a instalação.')
    progress(90 + (index + 1) * 2)
  }
  await loader.after('hard_reset')
  progress(100)
}
