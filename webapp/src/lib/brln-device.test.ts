import { describe, it, expect, vi } from 'vitest'
import { BRLNDevice } from './brln-device'
import { BowserDevice } from './bowser'

describe('explicit local wallet modes', () => {
  const device = () => new BRLNDevice({confirmPair:async()=>true, psbtReview:()=>{}, log:()=>{}, state:()=>{}})
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
  it('refuses old firmware that would show an implicit passphrase prompt', async () => {
    const connect=vi.spyOn(BowserDevice.prototype,'connect').mockResolvedValue()
    const d=device()
    vi.spyOn(d as any,'request').mockResolvedValue('brln-1 mainnet bip84 local-secrets physical-review')
    const disconnect=vi.spyOn(d,'disconnect').mockResolvedValue()
    try { await expect(d.connect()).rejects.toThrow('Firmware incompatível'); expect(disconnect).toHaveBeenCalled() }
    finally { connect.mockRestore() }
  })
})
