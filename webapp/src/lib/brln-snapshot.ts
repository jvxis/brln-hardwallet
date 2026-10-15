import type { UtxoRecord } from './types'
export { loadSummary, saveSummary, clearSummary } from './storage'

export function updatedLabel(updatedAt:number, now:number) {
  const minutes=Math.max(0,Math.floor((now-updatedAt)/60000))
  return minutes===0?'Atualizado há menos de 1 minuto':minutes<60?`Atualizado há ${minutes} min`:
    `Última atualização: ${new Date(updatedAt).toLocaleString('pt-BR')}`
}
export function revalidateSelection(previous:UtxoRecord[], fresh:UtxoRecord[]) {
  if(!previous.length)throw new Error('Selecione os UTXOs para enviar.')
  return previous.map(old=>{
    const next=fresh.find(c=>c.txid===old.txid && c.vout===old.vout)
    if(!next || !next.status.confirmed || next.value!==old.value || next.path!==old.path || next.xpub!==old.xpub)
      throw new Error('Os fundos selecionados mudaram. Confira o saldo atualizado e prepare novamente.')
    return next
  })
}
