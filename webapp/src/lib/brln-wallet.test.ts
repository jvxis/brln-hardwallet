import { describe, it, expect } from 'vitest'
import BIP32Factory from 'bip32'
import * as ecc from '@bitcoinerlab/secp256k1'
import * as bitcoin from 'bitcoinjs-lib'
import { publicAccount, preparePayment, ACCOUNT_PATH } from './brln-wallet'
import { deriveAddress } from './bitcoin'
import type { UtxoRecord } from './types'
const root = BIP32Factory(ecc).fromSeed(new Uint8Array(32).fill(7)) // test vector, never funds
const account = publicAccount({xpub:root.derivePath(ACCOUNT_PATH).neutered().toBase58(), fingerprint:Buffer.from(root.fingerprint).toString('hex'), accountPath:ACCOUNT_PATH, network:'Mainnet', type:'p2wpkh', receiveIndex:0, changeIndex:0})
const receiving = deriveAddress(account,0,0)
const parent = new bitcoin.Transaction()
parent.addInput(new Uint8Array(32),0)
parent.addOutput(bitcoin.address.toOutputScript(receiving.address),100_000n)
const coin: UtxoRecord = {id:parent.getId()+':0',txid:parent.getId(),vout:0,value:100_000,status:{confirmed:true},address:receiving.address,path:receiving.path,branch:0,index:0,accountId:account.id,accountName:account.name,accountPath:account.accountPath,accountType:'p2wpkh',xpub:account.xpub,fingerprint:account.fingerprint,selected:true}
const recipient = deriveAddress(account,0,10).address
const raw = async () => parent.toHex()
describe('BRLN account and transaction boundary',()=>{
 it('exports only the public policy and rejects private or wrong-depth keys',()=>{
  expect(publicAccount({...account,unexpected:'secret'})).not.toHaveProperty('unexpected')
  for(const xpub of [root.toBase58(),root.neutered().toBase58()]) expect(()=>publicAccount({...account,xpub})).toThrow()
  expect(()=>publicAccount({...account,network:'Testnet'})).toThrow()
 })
 it('builds a PSBT with owned change and accounts for the full fee',async()=>{
  const {transaction,changeIndex}=await preparePayment(account,[coin],recipient,40_000,2,raw)
  expect(changeIndex).toBe(1);expect(transaction.outputs[1].change).toBe(true)
  expect(transaction.outputs.reduce((s,o)=>s+o.amount,0)+transaction.fee).toBe(100_000)
  expect(bitcoin.Psbt.fromBase64(transaction.psbt).inputCount).toBe(1)
 })
 it('rejects altered amounts, scripts and duplicate outpoints before signing',async()=>{
  for(const bad of [{...coin,value:100_001},{...coin,address:recipient},{...coin,path:ACCOUNT_PATH+'/0/8'}]) await expect(preparePayment(account,[bad],recipient,40_000,2,raw)).rejects.toThrow()
  await expect(preparePayment(account,[coin,coin],recipient,40_000,2,raw)).rejects.toThrow('duplicado')
 })
 it('rejects unconfirmed coins, invalid amounts and excessive fees',async()=>{
  await expect(preparePayment(account,[{...coin,status:{confirmed:false}}],recipient,40_000,2,raw)).rejects.toThrow()
  for(const n of [NaN,1.5,0,-1]) await expect(preparePayment(account,[coin],recipient,n,2,raw)).rejects.toThrow()
  await expect(preparePayment(account,[coin],recipient,40_000,1000,raw)).rejects.toThrow()
 })
})
