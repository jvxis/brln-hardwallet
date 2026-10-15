import * as bitcoin from 'bitcoinjs-lib'
import { deriveAddress } from './bitcoin'
import type { WalletAccount, UtxoRecord } from './types'

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-BRLN-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40_000)]) : AbortSignal.timeout(40_000),
  })
  if (!response.ok) throw new Error(response.status === 401 ? 'Entre no LightningOS neste mesmo endereço e abra o app novamente.' : `Node indisponível ou solicitação recusada (${response.status}).`)
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
export async function scanAccount(account: WalletAccount, progress: (checked: number, branch: number) => void = () => {}, signal?: AbortSignal) {
  const utxos: UtxoRecord[] = []
  const history = new Map<string, number>()
  let receiveIndex = account.receiveIndex, changeIndex = account.changeIndex
  let checked = 0
  for (const branch of [0, 1] as const) {
    let unused = 0
    const reserved = branch === 0 ? account.receiveIndex : account.changeIndex
    for (let index = 0; unused < 20 || index < reserved; index++) {
      if (index >= 500) throw new Error('Limite de descoberta atingido. Use um coordenador compatível para carteiras maiores.')
      const address = deriveAddress(account, branch, index)
      signal?.throwIfAborted()
      const state = await api<ScriptState>(`script/${await scriptHash(address.address)}`, undefined, signal)
      progress(++checked, branch)
      const entries = state.history || []
      unused = entries.length ? 0 : unused + 1
      if (entries.length) {
        if (branch === 0) receiveIndex = Math.max(receiveIndex, index + 1)
        else changeIndex = Math.max(changeIndex, index + 1)
      }
      for (const item of entries) {
        if (!/^[0-9a-f]{64}$/i.test(item.tx_hash) || !Number.isSafeInteger(item.height)) throw new Error('Histórico inválido.')
        history.set(item.tx_hash, item.height)
      }
      for (const item of state.utxos || []) {
        if (!Number.isSafeInteger(item.value) || item.value <= 0 || item.value > 21e14 || !Number.isSafeInteger(item.tx_pos) || item.tx_pos < 0 || !/^[0-9a-f]{64}$/i.test(item.tx_hash)) throw new Error('UTXO inválido.')
        utxos.push({ id: `${item.tx_hash}:${item.tx_pos}`, txid: item.tx_hash, vout: item.tx_pos, value: item.value,
          status: { confirmed: item.height > 0, block_height: item.height > 0 ? item.height : undefined },
          address: address.address, path: address.path, branch, index, accountId: account.id, accountName: account.name,
          accountPath: account.accountPath, accountType: account.type, xpub: account.xpub, fingerprint: account.fingerprint, selected: item.height > 0 })
      }
    }
  }
  return { utxos, history: Array.from(history, ([txid, height]) => ({ txid, height })), receiveIndex, changeIndex }
}
export async function getTxHex(txid: string) {
  const { hex } = await api<{ hex: string }>(`transaction/${txid}`)
  if (bitcoin.Transaction.fromHex(hex).getId() !== txid) throw new Error('Transação retornada não corresponde ao txid.')
  return hex
}
