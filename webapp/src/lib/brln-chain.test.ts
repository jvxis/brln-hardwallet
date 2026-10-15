import { afterEach, describe, expect, it, vi } from 'vitest'
import BIP32Factory from 'bip32'
import * as ecc from '@bitcoinerlab/secp256k1'
import { scanAccount } from './brln-chain'
import { publicAccount, ACCOUNT_PATH } from './brln-wallet'

const root = BIP32Factory(ecc).fromSeed(new Uint8Array(32).fill(7))
const account = publicAccount({xpub:root.derivePath(ACCOUNT_PATH).neutered().toBase58(), fingerprint:Buffer.from(root.fingerprint).toString('hex'), accountPath:ACCOUNT_PATH, network:'Mainnet', type:'p2wpkh', receiveIndex:0, changeIndex:0})
afterEach(() => vi.unstubAllGlobals())
describe('public account synchronization without a signer', () => {
  it('reports all 40 unused receiving/change addresses and completes an empty account', async () => {
    const fetcher = vi.fn(async () => Response.json({history:[], utxos:[], balance:{confirmed:0,unconfirmed:0}}))
    vi.stubGlobal('fetch', fetcher)
    const progress = vi.fn()
    const result = await scanAccount(account, progress)
    expect(fetcher).toHaveBeenCalledTimes(40)
    expect(progress).toHaveBeenNthCalledWith(20,20,0)
    expect(progress).toHaveBeenLastCalledWith(40,1)
    expect(result.utxos).toEqual([])
    expect(result.history).toEqual([])
  })
  it('aborts discovery without returning a partial snapshot', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn(async () => Response.json({history:[],utxos:[],balance:{confirmed:0,unconfirmed:0}}))
    vi.stubGlobal('fetch',fetcher)
    await expect(scanAccount(account, () => controller.abort(),controller.signal)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('reports expired authentication instead of treating it as an empty balance', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:401})))
    await expect(scanAccount(account)).rejects.toThrow('Entre no LightningOS')
  })
})
