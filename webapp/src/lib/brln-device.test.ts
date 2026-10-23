import { describe, it, expect, vi } from 'vitest'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { BRLNDevice, BRLN_CAPABILITIES } from './brln-device'
import { BowserDevice } from './bowser'
import { deriveChannel, open, seal } from './brln-channel'
import { bytesToHex, hexToBytes } from './utils'

const device = (confirmPair = async (_code: string) => true) =>
  new BRLNDevice({confirmPair, psbtReview:()=>{}, log:()=>{}, state:()=>{}})

// Plays the firmware side of the committed pairing.
function firmware() {
  const secret = secp256k1.utils.randomSecretKey()
  const deviceKey = secp256k1.getPublicKey(secret, false).slice(1)
  let commitment = '', code = ''
  let channel: ReturnType<typeof deriveChannel>['channel'] | null = null
  const handle = async (command: string, args: Array<string | number>) => {
    if (command === '/brln-pair-commit') { commitment = String(args[0]); return '0 ' + bytesToHex(deviceKey) }
    if (command === '/brln-pair-reveal') {
      const hostKey = hexToBytes(String(args[0]))
      if (bytesToHex(sha256(hostKey)) !== commitment) return '1 commitment_mismatch'
      const point = new Uint8Array(65); point[0] = 4; point.set(hostKey, 1)
      const derived = deriveChannel(secp256k1.getSharedSecret(secret, point, false).slice(1, 33), hostKey, deviceKey, true)
      channel = derived.channel; code = derived.sas
      return '0'
    }
    throw new Error('unexpected ' + command)
  }
  return { handle, code: () => code, channel: () => channel! }
}

describe('brln-3 committed pairing', () => {
  it('commits before revealing and shows the same code as the device', async () => {
    const signer = firmware()
    let shown = ''
    const d = device(async code => { shown = code; return true })
    const request = vi.spyOn(d as any, 'request').mockImplementation(((command: string, args: Array<string | number>) => signer.handle(command, args)) as any)
    await (d as any).pair()
    expect(request.mock.calls.map(call => call[0])).toEqual(['/brln-pair-commit', '/brln-pair-reveal'])
    expect(request.mock.calls[0][1]).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/)])
    expect(request.mock.calls.every(call => call[2] === false)).toBe(true)
    expect(shown).toMatch(/^[0-9A-F]{4} [0-9A-F]{4}$/)
    expect(shown).toBe(signer.code())
    // Frames now authenticate in both directions with the device's keys.
    expect(open(signer.channel(), (d as any).encrypt('/capabilities'))).toBe('/capabilities')
    expect((d as any).decrypt(seal(signer.channel(), '/capabilities ' + BRLN_CAPABILITIES))).toBe('/capabilities ' + BRLN_CAPABILITIES)
  })
  it('closes the session on an unauthenticated frame', async () => {
    const signer = firmware()
    const d = device()
    vi.spyOn(d as any, 'request').mockImplementation(((command: string, args: Array<string | number>) => signer.handle(command, args)) as any)
    const disconnect = vi.spyOn(d, 'disconnect').mockResolvedValue()
    await (d as any).pair()
    const forged = seal(signer.channel(), '/xpub forged')
    expect(() => (d as any).decrypt(forged.slice(0, -2) + (forged.endsWith('0') ? '1' : '0'))).toThrow('não autenticada')
    expect(disconnect).toHaveBeenCalled()
    expect(() => (d as any).encrypt('/capabilities')).toThrow('Canal seguro')
  })
  it('explains that brln-2 firmware must be updated when the commitment is unanswered', async () => {
    const d = device()
    vi.spyOn(d as any, 'request').mockRejectedValue(new Error('/brln-pair-commit timed out'))
    await expect((d as any).pair()).rejects.toThrow('Firmware incompatível')
  })
  it('does not keep a session the user did not confirm', async () => {
    const signer = firmware()
    const d = device(async () => false)
    vi.spyOn(d as any, 'request').mockImplementation(((command: string, args: Array<string | number>) => signer.handle(command, args)) as any)
    vi.spyOn(d, 'disconnect').mockImplementation(async () => { (d as any).clearSession() })
    await expect((d as any).pair()).rejects.toThrow('não confirmado')
    expect(() => (d as any).encrypt('/capabilities')).toThrow('Canal seguro')
  })
})

describe('explicit local wallet modes', () => {
  it('sends mode only, never a host passphrase', async () => {
    const d=device()
    const request=vi.spyOn(d as any,'request').mockResolvedValue('1')
    await d.local('unlock')
    expect(request).toHaveBeenLastCalledWith('/brln-unlock',[],true,3600000)
    await d.local('unlock-passphrase')
    expect(request).toHaveBeenLastCalledWith('/brln-unlock-passphrase',[],true,3600000)
    expect(d.authenticated).toBe(true)
  })
  it('does not retain unlocked state when switching wallet fails', async () => {
    const d=device(); d.authenticated=true
    vi.spyOn(d as any,'request').mockResolvedValue('0 cancelled')
    await expect(d.local('unlock-passphrase')).rejects.toThrow()
    expect(d.authenticated).toBe(false)
  })
  it('refuses older firmware capabilities', async () => {
    for (const old of ['brln-1 mainnet bip84 local-secrets physical-review', 'brln-2 mainnet bip84 local-secrets physical-review explicit-passphrase']) {
      const connect=vi.spyOn(BowserDevice.prototype,'connect').mockResolvedValue()
      const d=device()
      vi.spyOn(d as any,'request').mockResolvedValue(old)
      const disconnect=vi.spyOn(d,'disconnect').mockResolvedValue()
      try { await expect(d.connect()).rejects.toThrow('Firmware incompatível'); expect(disconnect).toHaveBeenCalled() }
      finally { connect.mockRestore() }
    }
  })
})
