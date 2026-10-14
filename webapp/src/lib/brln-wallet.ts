import BIP32Factory from 'bip32'
import * as ecc from '@bitcoinerlab/secp256k1'
import * as bitcoin from 'bitcoinjs-lib'
import { createPsbt, deriveAddress, dustThresholdForAddress, estimateVsize } from './bitcoin'
import type { WalletAccount, UtxoRecord } from './types'

export const ACCOUNT_PATH = "m/84'/0'/0'"
const bip32 = BIP32Factory(ecc)
// Deliberately one interoperable policy in the pilot: mainnet BIP84 account 0.
export function publicAccount(value: unknown): WalletAccount {
  if (!value || typeof value !== 'object') throw new Error('Configuração pública inválida.')
  const a = value as WalletAccount
  if (typeof a.xpub !== 'string' || !a.xpub.startsWith('xpub') || a.accountPath !== ACCOUNT_PATH || a.network !== 'Mainnet' || a.type !== 'p2wpkh' || !/^[0-9a-f]{8}$/i.test(a.fingerprint)) throw new Error('Use uma conta pública BIP84 mainnet, conta 0.')
  const key = bip32.fromBase58(a.xpub)
  if (!key.isNeutered() || key.depth !== 3 || key.index !== 0x80000000) throw new Error('Chave pública de conta inválida.')
  for (const n of [a.receiveIndex, a.changeIndex]) if (!Number.isSafeInteger(n) || n < 0 || n > 479) throw new Error('Índice fora do limite do piloto.')
  return { id: a.fingerprint.toLowerCase() + ':' + a.xpub, name: 'Minha carteira', xpub: a.xpub, fingerprint: a.fingerprint.toLowerCase(), accountPath: ACCOUNT_PATH, network: 'Mainnet', type: 'p2wpkh', receiveIndex: a.receiveIndex, changeIndex: a.changeIndex, createdAt: typeof a.createdAt === 'string' ? a.createdAt : '' }
}

export async function preparePayment(account: WalletAccount, coins: UtxoRecord[], address: string, amount: number, feeRate: number, fetchTxHex: (txid: string) => Promise<string>) {
  publicAccount(account)
  if (!coins.length || coins.length > 20 || coins.some(c => !c.status.confirmed || c.accountId !== account.id)) throw new Error('Selecione de 1 a 20 UTXOs confirmados desta conta.')
  if (new Set(coins.map(c => c.id)).size !== coins.length) throw new Error('UTXO duplicado.')
  if (!Number.isSafeInteger(amount) || amount < dustThresholdForAddress(address, 'Mainnet') || amount > 21e14) throw new Error('Valor inválido ou abaixo do limite de dust.')
  if (!Number.isFinite(feeRate) || feeRate < 1 || feeRate > 1000) throw new Error('Taxa fora do intervalo de 1 a 1000 sat/vB.')
  // Validate every amount and script against its actual parent transaction,
  // rather than trusting the Electrum listunspent response as PSBT metadata.
  for (const coin of coins) {
    const parent = bitcoin.Transaction.fromHex(await fetchTxHex(coin.txid))
    const out = parent.outs[coin.vout]
    const expected = deriveAddress(account, coin.branch, coin.index)
    if (parent.getId() !== coin.txid || !out || out.value !== BigInt(coin.value) || coin.path !== expected.path || coin.address !== expected.address || !bitcoin.address.toOutputScript(expected.address).every((b, i) => b === out.script[i]) || out.script.length !== 22) throw new Error('Dados do UTXO não correspondem à transação original.')
  }
  const change = deriveAddress(account, 1, account.changeIndex)
  const total = coins.reduce((s, c) => s + c.value, 0)
  if (!Number.isSafeInteger(total) || total > 21e14) throw new Error('Saldo inválido.')
  const fee = Math.ceil(estimateVsize(coins, [address, change.address]) * feeRate)
  const remainder = total - amount - fee
  if (remainder < 0) throw new Error('Saldo insuficiente incluindo a taxa.')
  const useChange = remainder >= dustThresholdForAddress(change.address, 'Mainnet')
  const transaction = await createPsbt({ network: 'Mainnet', inputs: coins, recipients: [{id:'recipient', address, amount}],
    change: useChange ? {address:change.address, amount:remainder, path:change.path, accountType:'p2wpkh', xpub:account.xpub, fingerprint:account.fingerprint} : undefined,
    feeRate, fetchTxHex })
  if (transaction.fee > 100_000 || transaction.fee > amount / 10) throw new Error('Taxa acima do limite do piloto (100.000 sats ou 10% do envio). Revise os UTXOs e a taxa.')
  return {transaction, changeIndex: account.changeIndex + (useChange ? 1 : 0)}
}
