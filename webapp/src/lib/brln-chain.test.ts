import { afterEach, describe, expect, it, vi } from 'vitest'
import BIP32Factory from 'bip32'
import * as ecc from '@bitcoinerlab/secp256k1'
import { scanAccount, scriptHash } from './brln-chain'
import { deriveAddress } from './bitcoin'
import { publicAccount, ACCOUNT_PATH } from './brln-wallet'

const root = BIP32Factory(ecc).fromSeed(new Uint8Array(32).fill(7))
const account = publicAccount({xpub:root.derivePath(ACCOUNT_PATH).neutered().toBase58(), fingerprint:Buffer.from(root.fingerprint).toString('hex'), accountPath:ACCOUNT_PATH, network:'Mainnet', type:'p2wpkh', receiveIndex:0, changeIndex:0})
const empty = {history:[], utxos:[], balance:{confirmed:0,unconfirmed:0}}
const used = {history:[{tx_hash:'aa'.repeat(32),height:1}], utxos:[], balance:{confirmed:0,unconfirmed:0}}
// Answers each batched request, marking the given script hashes as used.
const node = (usedHashes = new Set<string>()) => vi.fn(async (_url: string, init?: RequestInit) => {
  const { hashes } = JSON.parse(String(init?.body)) as { hashes: string[] }
  return Response.json({ scripts: hashes.map(hash => usedHashes.has(hash) ? used : empty) })
})
afterEach(() => vi.unstubAllGlobals())
describe('public account synchronization without a signer', () => {
  it('reports all 40 unused receiving/change addresses with one request per branch', async () => {
    const fetcher = node()
    vi.stubGlobal('fetch', fetcher)
    const progress = vi.fn()
    const result = await scanAccount(account, progress)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/scripts')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method:'POST', headers:{ 'X-BRLN-Request':'1' } })
    expect(progress).toHaveBeenNthCalledWith(20,20,0)
    expect(progress).toHaveBeenLastCalledWith(40,1)
    expect(result.utxos).toEqual([])
    expect(result.history).toEqual([])
  })
  it('aborts discovery without returning a partial snapshot', async () => {
    const controller = new AbortController()
    const fetcher = node()
    vi.stubGlobal('fetch',fetcher)
    await expect(scanAccount(account, () => controller.abort(),controller.signal)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('reports expired authentication instead of treating it as an empty balance', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:401})))
    await expect(scanAccount(account)).rejects.toThrow('Entre no BR⚡LN LightningOS')
  })
  it('keeps cursors above 479 storable instead of breaking every later sync (#2)', async () => {
    const near = publicAccount({...account, receiveIndex:470})
    const usedHashes = new Set([await scriptHash(deriveAddress(near,0,460).address), await scriptHash(deriveAddress(near,0,479).address)])
    vi.stubGlobal('fetch', node(usedHashes))
    const result = await scanAccount(near)
    expect(result.receiveIndex).toBe(480)
    expect(() => publicAccount({...near, receiveIndex:result.receiveIndex})).not.toThrow()
  })
  it('refuses, explicitly, an account with activity at the discovery limit', async () => {
    const full = publicAccount({...account, receiveIndex:490})
    vi.stubGlobal('fetch', node(new Set([await scriptHash(deriveAddress(full,0,495).address)])))
    await expect(scanAccount(full)).rejects.toThrow('Conta maior que o piloto suporta')
  })
})
