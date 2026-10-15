import { BowserDevice } from './bowser'

export class BRLNDevice extends BowserDevice {
  protected override async prepareSession() {
    await this.restartForPairing()
  }
  override async connect() {
    await super.connect()
    try {
      const capability = await this.request('/capabilities')
      if (capability !== 'brln-2 mainnet bip84 local-secrets physical-review explicit-passphrase')
        throw new Error('Firmware incompatível. Instale o firmware validado do BR⚡LN Signer para o hardware compatível.')
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
