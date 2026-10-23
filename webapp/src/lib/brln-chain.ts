import * as bitcoin from 'bitcoinjs-lib'
import { deriveAddress } from './bitcoin'
import { ACCOUNT_INDEX_LIMIT } from './brln-wallet'
import type { WalletAccount, UtxoRecord } from './types'

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-BRLN-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40_000)]) : AbortSignal.timeout(40_000),
  })
  if (!response.ok) throw new Error(response.status === 401 ? 'Entre no BR⚡LN LightningOS neste mesmo endereço e abra o app novamente.' : `Node indisponível ou solicitação recusada (${response.status}).`)
  return response.json() as Promise<T>
}
type ScriptState = {
  history: Array<{ tx_hash: string; height: number }> | null
  balance: { confirmed: number; unconfirmed: number }
  utxos: Array<{ tx_hash: string; tx_pos: number; value: number; height: number }> | null
}
export async function scriptHash(address: string) {
  const script = bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(script).buffer))
  return Array.from(digest.reverse(), value => value.toString(16).padStart(2, '0')).join('')
}
// Must match maxScriptBatch in backend/server.go.
export const SCRIPT_BATCH_SIZE = 20

export async function scanAccount(account: WalletAccount, progress: (checked: number, branch: number) => void = () => {}, signal?: AbortSignal) {
  const utxos: UtxoRecord[] = []
  const history = new Map<string, number>()
  let receiveIndex = account.receiveIndex, changeIndex = account.changeIndex
  let checked = 0
  for (const branch of [0, 1] as const) {
    let unused = 0, index = 0
    const reserved = branch === 0 ? account.receiveIndex : account.changeIndex
    // Gap limit 20 beyond the last used or reserved address, in batches of one HTTP request each.
    while ((unused < 20 || index < reserved) && index < ACCOUNT_INDEX_LIMIT) {
      const addresses = Array.from({ length: Math.min(SCRIPT_BATCH_SIZE, ACCOUNT_INDEX_LIMIT - index) }, (_, offset) => deriveAddress(account, branch, index + offset))
      signal?.throwIfAborted()
      const hashes = await Promise.all(addresses.map(address => scriptHash(address.address)))
      const { scripts } = await api<{ scripts: ScriptState[] }>('scripts', { hashes }, signal)
      if (!Array.isArray(scripts) || scripts.length !== addresses.length) throw new Error('Resposta inválida do node.')
      for (const [offset, state] of scripts.entries()) {
        const address = addresses[offset], current = index + offset
        progress(++checked, branch)
        const entries = state.history || []
        unused = entries.length ? 0 : unused + 1
        if (entries.length) {
          if (branch === 0) receiveIndex = Math.max(receiveIndex, current + 1)
          else changeIndex = Math.max(changeIndex, current + 1)
        }
        for (const item of entries) {
          if (!/^[0-9a-f]{64}$/i.test(item.tx_hash) || !Number.isSafeInteger(item.height)) throw new Error('Histórico inválido.')
          history.set(item.tx_hash, item.height)
        }
        for (const item of state.utxos || []) {
          if (!Number.isSafeInteger(item.value) || item.value <= 0 || item.value > 21e14 || !Number.isSafeInteger(item.tx_pos) || item.tx_pos < 0 || !/^[0-9a-f]{64}$/i.test(item.tx_hash)) throw new Error('UTXO inválido.')
          utxos.push({ id: `${item.tx_hash}:${item.tx_pos}`, txid: item.tx_hash, vout: item.tx_pos, value: item.value,
            status: { confirmed: item.height > 0, block_height: item.height > 0 ? item.height : undefined },
            address: address.address, path: address.path, branch, index: current, accountId: account.id, accountName: account.name,
            accountPath: account.accountPath, accountType: account.type, xpub: account.xpub, fingerprint: account.fingerprint, selected: item.height > 0 })
        }
      }
      index += addresses.length
    }
    // Activity within 20 addresses of the limit means funds could exist beyond it.
    if (unused < 20 && index >= ACCOUNT_INDEX_LIMIT) throw new Error(`Conta maior que o piloto suporta (${ACCOUNT_INDEX_LIMIT} endereços por ramo). Use um coordenador compatível com esta conta pública.`)
  }
  return { utxos, history: Array.from(history, ([txid, height]) => ({ txid, height })), receiveIndex, changeIndex }
}
export async function getTxHex(txid: string) {
  const { hex } = await api<{ hex: string }>(`transaction/${txid}`)
  if (bitcoin.Transaction.fromHex(hex).getId() !== txid) throw new Error('Transação retornada não corresponde ao txid.')
  return hex
}
