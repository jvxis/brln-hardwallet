import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSummary,saveSummary,clearSummary,updatedLabel,revalidateSelection } from './brln-snapshot'
import type { WalletAccount,UtxoRecord } from './types'
const account={network:'Mainnet',type:'p2wpkh',accountPath:"m/84'/0'/0'",fingerprint:'12345678',xpub:'public-test-key'} as WalletAccount
const summary={source:'club' as const,updatedAt:1000,balance:123,history:[{txid:'a'.repeat(64),height:100}]}
let data:Map<string,string>
beforeEach(()=>{data=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)})})
describe('public display snapshot',()=>{
 it('restores only this account and retains source/time',()=>{saveSummary(account,summary);expect(loadSummary(account,2000)).toEqual(summary);expect(loadSummary({...account,xpub:'another-account'},2000)).toBeNull();expect(loadSummary({...account,fingerprint:'different'},2000)).toBeNull()})
 it('never caches inputs, selections or extra fields',()=>{saveSummary(account,{...summary,utxos:['untrusted'],seed:'secret'} as any);const saved=[...data.values()][0];expect(saved).not.toContain('secret');expect(saved).not.toContain('utxos');expect(saved).not.toContain('selected')})
 it('discards corrupt/future/invalid snapshots, tolerates unavailable storage',()=>{for(const value of [{...summary,updatedAt:3000},{...summary,balance:-1},{...summary,source:'other'},{...summary,history:[{txid:'bad',height:1}]}]){saveSummary(account,value as any);expect(loadSummary(account,2000)).toBeNull()}data.set('brln-wallet-summary.v1','{bad');expect(loadSummary(account)).toBeNull();vi.stubGlobal('localStorage',{getItem:()=>{throw Error()},setItem:()=>{throw Error()},removeItem:()=>{throw Error()}});expect(()=>saveSummary(account,summary)).not.toThrow();expect(loadSummary(account)).toBeNull();expect(()=>clearSummary()).not.toThrow()})
 it('can forget the previous display after a broadcast',()=>{saveSummary(account,summary);clearSummary();expect(loadSummary(account)).toBeNull()})
 it('labels the age without claiming live data',()=>{expect(updatedLabel(1000,1100)).toContain('menos de 1');expect(updatedLabel(1000,121000)).toContain('2 min')})
})
describe('mandatory send revalidation',()=>{
 const coin={txid:'a'.repeat(64),vout:0,value:100,path:'m/0/0',xpub:'public',status:{confirmed:true}} as UtxoRecord
 it('uses only fresh selected outputs, not newly discovered ones',()=>{const fresh={...coin};expect(revalidateSelection([coin],[fresh,{...coin,vout:1}])).toEqual([fresh]);expect(revalidateSelection([coin],[fresh])[0]).toBe(fresh)})
 it('rejects spent, changed or unconfirmed outputs',()=>{for(const fresh of [[],[{...coin,value:1}],[{...coin,status:{confirmed:false}}],[{...coin,xpub:'wrong'}]])expect(()=>revalidateSelection([coin],fresh)).toThrow();expect(()=>revalidateSelection([],[])).toThrow()})
})
