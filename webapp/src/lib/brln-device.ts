import { BowserDevice } from './bowser'

export class BRLNDevice extends BowserDevice {
  override async connect() {
    await super.connect()
    try {
      const capability = await this.request('/capabilities')
      if (capability !== 'brln-1 mainnet bip84 local-secrets physical-review')
        throw new Error('Firmware incompatível. Instale o perfil BRLN T-Display validado.')
    } catch (error) { await this.disconnect(); throw error }
  }
  async local(operation: 'create' | 'restore' | 'unlock' | 'backup') {
    const result = await this.request(`/brln-${operation}`, [], true, 60 * 60_000)
    if (result.trim() !== '1') throw new Error('Operação cancelada ou recusada na placa.')
    if (operation !== 'backup') { this.authenticated = true; this.walletConfigured = true }
  }
  override async login(): Promise<void> { throw new Error('Use o desbloqueio na placa.') }
  override async restore(): Promise<void> { throw new Error('Use a recuperação na placa.') }
  override async wipe(): Promise<void> { throw new Error('Reset remoto indisponível.') }
  override async createWithDice(): Promise<void> { throw new Error('Use a criação na placa.') }
}
