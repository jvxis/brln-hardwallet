import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { BowserDevice } from './bowser'
import { clearChannel, deriveChannel, open, seal, type Channel } from './brln-channel'
import { bytesToHex, hexToBytes } from './utils'

export const BRLN_CAPABILITIES = 'brln-3 mainnet bip84 local-secrets physical-review explicit-passphrase'
// Additions a newer firmware may announce after the required set.
const OPTIONAL_CAPABILITIES = new Set(['keypad-restore'])

// Progress of a keypad restore: word position and letter count only.
export type KeypadState =
  | { phase: 'grid' | 'device'; word: number; total: number; letters: number }
  | { phase: 'review' }
export type KeypadKey = number | 'back' | 'done' | 'cancel'
const OUTDATED_FIRMWARE = 'Firmware incompatível. Instale o firmware validado do BR⚡LN Signer para o hardware compatível.'

export class BRLNDevice extends BowserDevice {
  private channel: Channel | null = null
  private keypadListener: ((state: KeypadState) => void) | null = null
  /** The connected firmware restores with the computer keypad. */
  keypadRestore = false

  protected override async prepareSession() {
    await this.restartForPairing()
  }
  // brln-3: commit to the host key first, so a relay cannot grind both pairing codes to match.
  protected override async pair() {
    const privateKey = secp256k1.utils.randomSecretKey()
    const hostKey = secp256k1.getPublicKey(privateKey, false).slice(1)
    try {
      let committed: string
      try { committed = await this.request('/brln-pair-commit', [bytesToHex(sha256(hostKey))], false, 20_000) }
      catch { throw new Error(OUTDATED_FIRMWARE) }
      const [status, deviceHex] = committed.split(' ')
      if (status !== '0' || !/^[0-9a-f]{128}$/i.test(deviceHex || '')) {
        if (deviceHex === 'connection_period_expired') throw new Error('O tempo de pareamento expirou. Reconecte o BR⚡LN Signer.')
        if (deviceHex === 'rng_failure') throw new Error('O BR⚡LN Signer recusou o pareamento: falha no gerador aleatório.')
        throw new Error('O BR⚡LN Signer recusou o pareamento.')
      }
      const deviceKey = hexToBytes(deviceHex)
      if ((await this.request('/brln-pair-reveal', [bytesToHex(hostKey)], false, 20_000)).trim() !== '0')
        throw new Error('O BR⚡LN Signer recusou o pareamento.')
      const devicePoint = new Uint8Array(65); devicePoint[0] = 4; devicePoint.set(deviceKey, 1)
      const shared = secp256k1.getSharedSecret(privateKey, devicePoint, false).slice(1, 33)
      const { channel, sas } = deriveChannel(shared, hostKey, deviceKey)
      shared.fill(0)
      this.channel = channel
      if (!(await this.events.confirmPair(sas))) {
        await this.disconnect()
        throw new Error('Código de pareamento não confirmado.')
      }
    } finally { privateKey.fill(0) }
  }
  protected override encrypt(message: string) {
    if (!this.channel) throw new Error('Canal seguro não estabelecido.')
    return seal(this.channel, message)
  }
  // A rejected frame closes the session: the next connection reboots and re-pairs the device.
  protected override decrypt(value: string) {
    if (!this.channel) throw new Error('Resposta cifrada antes do pareamento.')
    try { return open(this.channel, value) }
    catch {
      this.clearSession()
      void this.disconnect().catch(() => undefined)
      throw new Error('Resposta do BR⚡LN Signer não autenticada. Reconecte o dispositivo.')
    }
  }
  protected override clearSession() {
    clearChannel(this.channel)
    this.channel = null
  }
  override async connect() {
    this.keypadRestore = false
    await super.connect()
    try {
      const announced = (await this.request('/capabilities')).trim().split(' ')
      const required = BRLN_CAPABILITIES.split(' ')
      const extra = announced.slice(required.length)
      if (required.some((token, index) => announced[index] !== token) || extra.some(token => !OPTIONAL_CAPABILITIES.has(token)))
        throw new Error(OUTDATED_FIRMWARE)
      this.keypadRestore = extra.includes('keypad-restore')
    } catch (error) { await this.disconnect(); throw error }
  }
  async local(operation: 'create' | 'restore' | 'restore-keypad' | 'unlock' | 'unlock-passphrase' | 'backup') {
    if (operation !== 'backup') this.authenticated = false
    const result = (await this.request(`/brln-${operation}`, [], true, 60 * 60_000)).trim()
    if (result === '0 invalid_words') throw new Error('As palavras não formam uma seed válida. Confira o backup e tente de novo.')
    if (result !== '1') throw new Error('Operação cancelada ou recusada no BR⚡LN Signer.')
    if (operation !== 'backup') { this.authenticated = true; this.walletConfigured = true }
  }
  // The Signer shows the letter groups; this computer only sends the clicked cell.
  async restoreWithKeypad(onState: (state: KeypadState) => void) {
    if (!this.keypadRestore) throw new Error('Atualize o firmware do BR⚡LN Signer para recuperar pelo teclado.')
    this.keypadListener = onState
    try { await this.local('restore-keypad') } finally { this.keypadListener = null }
  }
  async keypadKey(key: KeypadKey) {
    if (!this.keypadListener) throw new Error('Nenhuma recuperação em andamento.')
    if (typeof key === 'number' && !(Number.isInteger(key) && key >= 1 && key <= 9)) throw new Error('Posição inválida.')
    await this.send('/brln-key', [key])
  }
  protected override handleEvent(command: string, data: string) {
    if (command !== '/brln-keypad') return false
    if (data === 'review') { this.keypadListener?.({ phase: 'review' }); return true }
    const [word, total, letters, phase, ...rest] = data.split(' ')
    const numbers = [word, total, letters].map(Number)
    if (!rest.length && (phase === 'grid' || phase === 'device') && numbers.every(Number.isInteger) &&
        (numbers[1] === 12 || numbers[1] === 24) && numbers[0] >= 1 && numbers[0] <= numbers[1] && numbers[2] >= 0 && numbers[2] <= 8)
      this.keypadListener?.({ phase, word: numbers[0], total: numbers[1], letters: numbers[2] })
    return true
  }
  override async login(): Promise<void> { throw new Error('Use o desbloqueio no BR⚡LN Signer.') }
  override async restore(): Promise<void> { throw new Error('Use a recuperação no BR⚡LN Signer.') }
  override async wipe(): Promise<void> { throw new Error('Reset remoto indisponível.') }
  override async createWithDice(): Promise<void> { throw new Error('Use a criação no BR⚡LN Signer.') }
}
