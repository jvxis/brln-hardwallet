<script lang="ts">
  import { onMount } from 'svelte'
  import { initializeAppearance } from '$lib/appearance'
  import { BRLNDevice } from '$lib/brln-device'
  import FirmwareInstaller from '$lib/FirmwareInstaller.svelte'
  import { api, scanAccount, getTxHex } from '$lib/brln-chain'
  import { ACCOUNT_PATH, publicAccount, preparePayment } from '$lib/brln-wallet'
  import { deriveAddress, finalizePsbt } from '$lib/bitcoin'
  import { loadAccounts, saveAccounts } from '$lib/storage'
  import type { WalletAccount, UtxoRecord, UnsignedTransaction } from '$lib/types'

  let connected = false, unlocked = false, busy = false, message = '', failure = false
  let account: WalletAccount | null = null
  let coins: UtxoRecord[] = [], history: Array<{txid:string;height:number}> = []
  let height: number | null = null, scanned = false, address = '', amount = 0, rate = 1
  let source = ''
  let syncController: AbortController | null = null
  $: balanceLabel = scanned ? `Saldo descoberto: ${balance.toLocaleString('pt-BR')} sats · ${history.length} transações` : 'Saldo ainda não consultado. Sincronize a conta pública; não é necessário conectar a LilyGO.'
  let receive = '', proposal: UnsignedTransaction | null = null
  let signed: ReturnType<typeof finalizePsbt> | null = null
  let broadcastState: 'new' | 'unknown' | 'done' = 'new'
  const operations = [{id:'unlock',label:'Desbloquear carteira'},{id:'create',label:'Criar carteira'},{id:'restore',label:'Recuperar carteira'},{id:'backup',label:'Conferir backup'}] as const
  const device = new BRLNDevice({
    confirmPair: async code => window.confirm('Confira o código ' + code + ' na tela da placa. Os códigos são iguais?'),
    psbtReview: step => { if (step) message = 'Confira o endereço completo, valor, troco e taxa na placa. Aprove pelos botões.' },
    log: () => {}, state: () => { connected = device.connected; unlocked = device.authenticated },
  })
  $: balance = coins.reduce((sum, coin) => sum + coin.value, 0)
  $: selected = coins.filter(coin => coin.selected)
  async function run(action: () => Promise<void>) {
    if (busy) return
    busy = true; failure = false; message = ''
    try { await action() } catch (e) { failure = true; message = e instanceof Error ? e.message : 'Operação recusada.' }
    finally { busy = false; connected = device.connected; unlocked = device.authenticated }
  }
  function persist(next: WalletAccount) { next = publicAccount(next); saveAccounts([next]); account = next }
  async function refresh() {
    syncController = new AbortController()
    try {
    message = 'Consultando o node. A LilyGO pode permanecer desconectada.'
    const status = await api<{height:number;electrum_source:string}>('status', undefined, syncController.signal)
    height=status.height; source=status.electrum_source
    if (account) {
      message = 'Buscando histórico e saldo. Isso pode levar alguns minutos.'
      const snapshot = await scanAccount(account, (checked, branch) => {
        message = `Sincronizando: ${checked} endereços consultados · ${branch === 0 ? 'recebimento' : 'troco'}. Aguarde.`
      }, syncController.signal)
      persist({...account, receiveIndex:snapshot.receiveIndex, changeIndex:snapshot.changeIndex})
      coins = snapshot.utxos; history = snapshot.history; scanned = true; receive = ''
      message = 'Sincronização concluída. Saldo e histórico atualizados.'
    }
    } catch (error) {
      if (syncController.signal.aborted) throw new Error('Sincronização cancelada. Nenhum resultado parcial foi aplicado.')
      throw error
    } finally { syncController = null }
  }
  async function sameDevice() {
    if (!account) throw new Error('Importe a conta pública primeiro.')
    const key = await device.getXpub('Mainnet', ACCOUNT_PATH)
    if (key.xpub !== account.xpub || key.fingerprint.toLowerCase() !== account.fingerprint) throw new Error('A conta não corresponde à carteira ou à passphrase desbloqueada na placa.')
  }
  async function importDevice() {
    const key = await device.getXpub('Mainnet', ACCOUNT_PATH)
    if (account && key.xpub !== account.xpub && !window.confirm('Substituir a conta pública neste navegador? Exporte a configuração atual antes.')) return
    persist({...key, id:'', name:'', accountPath:ACCOUNT_PATH, network:'Mainnet', type:'p2wpkh', receiveIndex:account?.xpub === key.xpub ? account.receiveIndex : 0, changeIndex:account?.xpub === key.xpub ? account.changeIndex : 0, createdAt:new Date().toISOString()})
    coins = []; scanned = false; proposal = null; signed = null; receive = ''
    message = 'Conta pública importada. Exporte a configuração e sincronize com seu node.'
  }
  function download(name:string, data:string, type='application/json') {
    const url = URL.createObjectURL(new Blob([data],{type})); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000)
  }
  async function importConfig(event: Event) {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]
    if (!file) return
    if (file.size > 8192) throw new Error('Configuração muito grande.')
    const value = publicAccount(JSON.parse(await file.text()))
    if (account && !window.confirm('Substituir a conta pública deste navegador?')) return
    persist(value); coins=[]; history=[]; scanned=false; receive=''; proposal=null; signed=null; input.value=''
  }
  async function showReceive() {
    if (!account || !scanned) throw new Error('Sincronize a conta antes de gerar um endereço.')
    await sameDevice()
    const next = deriveAddress(account!, 0, account!.receiveIndex)
    await device.verifyAddress('Mainnet', next.path, next.address)
    persist({...account!, receiveIndex:account!.receiveIndex+1}); receive=next.address
    message = 'Endereço confirmado na placa. Confira todos os caracteres.'
  }
  async function prepare() {
    if (!account || !scanned) throw new Error('Sincronize a conta primeiro.')
    const result = await preparePayment(account, selected, address.trim(), amount, rate, getTxHex)
    persist({...account, changeIndex:result.changeIndex})
    proposal = result.transaction; signed=null; broadcastState='new'
    message = 'Proposta pronta. Confira cada saída e a taxa antes de assinar.'
  }
  async function sign() {
    if (!proposal) return
    await sameDevice()
    const result = await device.sign(proposal)
    signed = finalizePsbt(result.psbt, 'Mainnet', proposal.psbt)
    message = 'Assinatura verificada. A transmissão exige uma ação separada.'
  }
  async function broadcast() {
    if (!signed || broadcastState === 'done') return
    const expected = signed.txid
    if (broadcastState === 'unknown') {
      await getTxHex(expected); broadcastState='done'; scanned=false; message='Transação encontrada no node.'; return
    }
    broadcastState='unknown'
    try {
      const result = await api<{txid:string}>('broadcast',{hex:signed.hex})
      if (result.txid !== expected) throw new Error('Txid divergente.')
      broadcastState='done'; message='Transação transmitida ao seu node.'; scanned=false
    } catch { throw new Error('Resultado desconhecido. Consulte o txid ' + expected + ' antes de qualquer nova tentativa. Você pode exportar a transação assinada.') }
  }
  onMount(() => {
    initializeAppearance()
    window.addEventListener('hashchange', initializeAppearance)
    try { const saved = loadAccounts()[0]; if (saved) account=publicAccount(saved) } catch { message='Configuração local inválida. Importe novamente a conta pública.'; failure=true }
    void run(async () => { const status=await api<{height:number;electrum_source:string}>('status');height=status.height;source=status.electrum_source })
    return () => { window.removeEventListener('hashchange', initializeAppearance); void device.disconnect() }
  })
</script>

<svelte:head><link rel="stylesheet" href="/los-theme/theme.css" /><title>BRLN · Carteira soberana</title><meta name="description" content="Coordenador Bitcoin local com assinador ESP32 e LightningOS" /></svelte:head>
<main>
  <header><div class="brand"><img src="/brln-logo.png" alt="BRLN" /><div><h1>Hardwallet</h1><small>BITCOIN · LIGHTNINGOS</small></div></div><span class="badge">PILOTO EXPERIMENTAL</span></header>
  <p class="intro">O LightningOS consulta a blockchain. A T-Display confere e assina. Seed, senha e passphrase são digitadas somente pelos botões da placa.</p>
  <aside>Protótipo sem auditoria independente e sem validação física concluída. Use uma carteira de laboratório, sem fundos reais. USB não é air gap. Esta aplicação não controla o saldo nem os canais do LND.</aside>
  <div class="status"><span>Node · {height === null ? 'indisponível' : 'bloco ' + height}</span><span>Electrum · {source==='club' ? 'clube · servidor público' : source==='local' ? 'meu node' : 'não consultado'}</span><span>Placa · {connected ? unlocked ? 'desbloqueada' : 'bloqueada' : 'desconectada'}</span><span>Bitcoin mainnet · BIP84</span></div>
  {#if source==='club'}<p>O LOS consulta o servidor público electrum.br-ln.com:50001 pela internet. Essa conexão usa TCP sem TLS: o servidor e intermediários de rede podem observar suas consultas. As chaves continuam na placa. A escolha do servidor é feita na loja do LOS, sem fallback automático.</p>{/if}
  <p class:failure role="status" aria-live="polite" hidden={!message}>{busy ? 'Em andamento · ' : ''}{message}</p>
  {#if syncController}<button class="secondary" on:click={() => syncController?.abort()}>Cancelar sincronização</button>{/if}
  <FirmwareInstaller bind:busy {connected} hasProposal={!!proposal} />
  <section class="section-card"><h2>01 <span>Conectar o assinador</span></h2><p>Com o firmware já instalado, conecte a placa por USB a este computador. Use Chromium, Chrome ou Edge com HTTPS confiável e confira o código de pareamento na tela da placa.</p>
    <div class="buttons"><button disabled={busy || connected} on:click={() => run(() => device.connect())}>Conectar por USB</button><button class="secondary" disabled={busy || !connected} on:click={() => run(() => device.disconnect())}>Desconectar</button></div>
    {#if connected}<div class="buttons">{#each operations as operation}<button class="secondary" disabled={busy || (operation.id==='backup' && !unlocked)} on:click={() => run(async () => {message='Continue pelos dois botões da placa.'; await device.local(operation.id)})}>{operation.label}</button>{/each}<button class="secondary" disabled={busy || !unlocked} on:click={() => run(() => device.logout())}>Bloquear</button></div>{/if}
  </section>
  <section class="section-card"><h2>02 <span>Conta pública e backup</span></h2><p>A configuração pública permite acompanhar o saldo e recuperar endereços em outro coordenador. Ela revela sua atividade financeira; guarde-a com privacidade. O backup das palavras fica offline, preferencialmente em metal.</p>
    <div class="buttons"><button disabled={busy || !unlocked || !!proposal} on:click={() => run(importDevice)}>Importar da placa</button><label class="file">Importar configuração pública<input type="file" accept="application/json,.json" disabled={busy || !!proposal} on:change={event => run(() => importConfig(event))} /></label><button class="secondary" disabled={busy || !account} on:click={() => account && download('brln-conta-publica.json',JSON.stringify(publicAccount(account),null,2))}>Exportar configuração</button></div>
    {#if account}<p class="mono">Fingerprint {account.fingerprint} · {account.accountPath}<br />{account.xpub}</p><p>{balanceLabel}</p><div class="buttons"><button disabled={busy || !!proposal} on:click={() => run(refresh)}>Sincronizar com Electrum selecionado</button><button class="secondary" disabled={busy || !scanned || !unlocked || !!proposal} on:click={() => run(showReceive)}>Conferir endereço para receber</button></div>{#if receive}<p class="mono receive">{receive}</p>{/if}{/if}
  </section>
  <section class="section-card"><h2>03 <span>Preparar, conferir e assinar</span></h2>
    {#if coins.length}<fieldset disabled={busy || !!proposal}><legend>UTXOs · somente confirmados podem ser gastos</legend>{#each coins as coin}<label class="coin"><input type="checkbox" bind:checked={coin.selected} disabled={!coin.status.confirmed} /><span>{coin.value.toLocaleString('pt-BR')} sats <small class="mono">{coin.txid}:{coin.vout}</small></span></label>{/each}</fieldset>{/if}
    <fieldset disabled={busy || !!proposal || !scanned}><label>Endereço de destino<input bind:value={address} autocomplete="off" spellcheck="false" placeholder="bc1…" /></label><div class="fields"><label>Valor em sats<input type="number" bind:value={amount} min="1" step="1" /></label><label>Taxa em sat/vB<input type="number" bind:value={rate} min="1" max="1000" step="0.1" /></label></div><div class="buttons"><button class="secondary" on:click={() => run(async () => {rate=(await api<{sat_per_vbyte:number}>('fees')).sat_per_vbyte})}>Consultar taxa no node</button><button disabled={!selected.length} on:click={() => run(prepare)}>Preparar transação</button></div></fieldset>
    {#if proposal}<div class="review"><h3>Proposta congelada</h3>{#each proposal.outputs as output}<p><strong>{output.change ? 'Troco' : 'Destino'} · {output.amount.toLocaleString('pt-BR')} sats</strong><br /><span class="mono">{output.address}</span></p>{/each}<p>Taxa: <strong>{proposal.fee} sats</strong> · estimativa {proposal.feeRate.toFixed(2)} sat/vB</p><div class="buttons"><button disabled={busy || !unlocked || !!signed} on:click={() => run(sign)}>Conferir e assinar na placa</button><button class="secondary" disabled={busy || broadcastState==='unknown'} on:click={() => {proposal=null; signed=null; coins=[]; scanned=false; message='Proposta encerrada. Sincronize a conta antes de preparar outra.'}}>Encerrar proposta</button></div></div>{/if}
    {#if signed}<div class="review"><h3>Assinatura verificada</h3><p class="mono">{signed.txid}</p><p>Taxa final: {signed.fee} sats · {signed.feeRate.toFixed(2)} sat/vB</p><div class="buttons"><button disabled={busy || broadcastState==='done'} on:click={() => run(broadcast)}>{broadcastState==='unknown' ? 'Consultar resultado no node' : broadcastState==='done' ? 'Transmitida' : 'Transmitir pelo Electrum selecionado'}</button><button class="secondary" on:click={() => signed && download('brln-' + signed.txid + '.hex',signed.hex,'text/plain')}>Exportar transação assinada</button></div></div>{/if}
  </section>
  <footer>BRLN · Código aberto · Sem custódia do clube<br />O protótipo usa ESP32 da Espressif. A portabilidade do backup é independente desta placa e do LightningOS.</footer>
</main>

<style>
  :global(*){box-sizing:border-box} :global(body){margin:0;line-height:1.6}main{max-width:1120px;margin:auto;padding:24px}header,.status,.buttons,.fields{display:flex;align-items:center;gap:16px;flex-wrap:wrap}header{justify-content:space-between;margin-bottom:20px}.brand{display:flex;align-items:center;gap:18px}.brand img{width:112px;padding:8px;background:#08111f;border-radius:12px}.brand h1{font-size:25px;margin:0;font-weight:700}.brand small{display:block;color:rgb(var(--color-fog)/.7);font-size:11px;letter-spacing:1px}.badge{font-size:11px;border:1px solid rgb(var(--color-brass)/.5);color:rgb(var(--color-fog));border-radius:20px;padding:4px 12px}.intro{max-width:850px;color:rgb(var(--color-fog)/.8);font-size:15px;margin:10px 0}aside{border-left:3px solid rgb(var(--color-brass));padding:10px 16px;background:rgb(var(--color-brass)/.08);font-size:13px}.status{font-size:13px;color:rgb(var(--color-fog)/.75);margin:16px 0}section{margin:20px 0;padding:22px}h2{color:rgb(var(--color-glow));font-size:15px;margin:0 0 12px}h2 span{color:rgb(var(--color-fog));font-size:22px;margin-left:12px}p{overflow-wrap:anywhere}section>p{color:rgb(var(--color-fog)/.8)}.buttons{margin:16px 0;gap:10px}button,.file{background:rgb(var(--color-glow));color:#08111f;border:1px solid rgb(var(--color-glow));padding:10px 15px;border-radius:8px;font-weight:650;font-size:14px;font-family:inherit;cursor:pointer}button.secondary,.file{background:transparent;color:rgb(var(--color-fog));border-color:rgb(var(--color-fog)/.25)}button:disabled,input:disabled,fieldset:disabled{opacity:.5;cursor:default}input:not([type=checkbox]){display:block;width:100%;padding:12px;background:rgb(var(--color-ink)/.7);color:rgb(var(--color-fog));border:1px solid rgb(var(--color-fog)/.25);border-radius:8px;margin-top:7px;font:inherit}input[type=file]{font-size:12px}.file{max-width:280px}fieldset{border:0;padding:0;margin:20px 0}label{display:block;font-size:14px}.fields>label{flex:1;min-width:160px;margin-top:18px}.coin{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid rgb(var(--color-fog)/.15)}.coin small{display:block;overflow-wrap:anywhere}.coin span{min-width:0}.mono{font-family:ui-monospace,monospace;font-size:13px;overflow-wrap:anywhere}.review,.receive{background:rgb(var(--color-glow)/.06);border:1px solid rgb(var(--color-glow)/.25);border-radius:8px;padding:20px;margin-top:20px}[role=status]{padding:12px;background:rgb(var(--color-glow)/.12);border-radius:8px}.failure{background:rgb(var(--color-ember)/.15)!important;border-left:3px solid rgb(var(--color-ember))}footer{color:rgb(var(--color-fog)/.65);font-size:12px;padding:20px 0}button:focus-visible,input:focus-visible{outline:3px solid rgb(var(--color-glow));outline-offset:3px}@media(max-width:600px){main{padding:16px}section{padding:16px}h2 span{font-size:19px}.brand img{width:90px}.brand h1{font-size:22px}}
</style>
