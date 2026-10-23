import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { BowserDevice } from './bowser'
import { clearChannel, deriveChannel, open, seal, type Channel } from './brln-channel'
import { bytesToHex, hexToBytes } from './utils'

export const BRLN_CAPABILITIES = 'brln-3 mainnet bip84 local-secrets physical-review explicit-passphrase'
const OUTDATED_FIRMWARE = 'Firmware incompatível. Instale o firmware validado do BR⚡LN Signer para o hardware compatível.'

export class BRLNDevice extends BowserDevice {
  private channel: Channel | null = null

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
    await super.connect()
    try {
      if (await this.request('/capabilities') !== BRLN_CAPABILITIES) throw new Error(OUTDATED_FIRMWARE)
    } catch (error) { await this.disconnect(); throw error }
  }
  async local(operation: 'create' | 'restore' | 'unlock' | 'unlock-passphrase' | 'backup') {
    if (operation !== 'backup') this.authenticated = false
    const result = await this.request(`/brln-${operation}`, [], true, 60 * 60_000)
    if (result.trim() !== '1') throw new Error('Operação cancelada ou recusada no BR⚡LN Signer.')
    if (operation !== 'backup') { this.authenticated = true; this.walletConfigured = true }
  }
  override async login(): Promise<void> { throw new Error('Use o desbloqueio no BR⚡LN Signer.') }
  override async restore(): Promise<void> { throw new Error('Use a recuperação no BR⚡LN Signer.') }
  override async wipe(): Promise<void> { throw new Error('Reset remoto indisponível.') }
  override async createWithDice(): Promise<void> { throw new Error('Use a criação no BR⚡LN Signer.') }
}
