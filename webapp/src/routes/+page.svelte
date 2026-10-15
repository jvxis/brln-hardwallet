<script lang="ts">
  import { onMount } from 'svelte'
  import QRCode from 'qrcode'
  import { initializeAppearance } from '$lib/appearance'
  import { BRLNDevice } from '$lib/brln-device'
  import FirmwareInstaller from '$lib/FirmwareInstaller.svelte'
  import { api, scanAccount, getTxHex } from '$lib/brln-chain'
  import { ACCOUNT_PATH, publicAccount, preparePayment } from '$lib/brln-wallet'
  import { deriveAddress, finalizePsbt } from '$lib/bitcoin'
  import { loadAccounts, saveAccounts } from '$lib/storage'
  import { loadSummary, saveSummary, clearSummary, updatedLabel, revalidateSelection } from '$lib/brln-snapshot'
  import type { WalletAccount, UtxoRecord, UnsignedTransaction } from '$lib/types'

  let connected = false, unlocked = false, busy = false, message = '', failure = false
  let account: WalletAccount | null = null
  let coins: UtxoRecord[] = [], history: Array<{txid:string;height:number}> = []
  let height: number | null = null, scanned = false, address = '', amount = 0, rate = 1
  let source = ''
  let updatedAt=0, now=Date.now(), cachedBalance=0, syncMessage='', syncFailure=false
  let tab: 'receive' | 'send' | 'history' = 'receive'
  let receiveQR = '', receiveChecked = false
  let confirmation: HTMLDialogElement
  let confirmationText = ''
  let resolveConfirmation: ((accepted:boolean)=>void) | null = null
  function askConfirmation(text:string): Promise<boolean> {
    confirmationText=text
    confirmation.returnValue='cancel'
    return new Promise(resolve => { resolveConfirmation=resolve; confirmation.showModal() })
  }
  function finishConfirmation() {
    resolveConfirmation?.(confirmation.returnValue==='accept'); resolveConfirmation=null
  }
  $: if (!receive) { receiveQR = ''; receiveChecked = false }
  let syncController: AbortController | null = null
  $: balanceLabel = updatedAt ? `Saldo na última consulta: ${(scanned?balance:cachedBalance).toLocaleString('pt-BR')} sats · ${history.length} transações` : 'Saldo ainda não consultado. Sincronize a conta pública; não é necessário conectar o BR⚡LN Signer.'
  let receive = '', proposal: UnsignedTransaction | null = null
  let signed: ReturnType<typeof finalizePsbt> | null = null
  let broadcastState: 'new' | 'unknown' | 'done' = 'new'
  const operations = [{id:'unlock',label:'Desbloquear carteira'},{id:'create',label:'Criar carteira'},{id:'restore',label:'Recuperar carteira'},{id:'backup',label:'Conferir backup'}] as const
  const device = new BRLNDevice({
    confirmPair: code => askConfirmation('Confira o código ' + code + ' na tela do BR⚡LN Signer. Os códigos são iguais?'),
    psbtReview: step => { if (step) message = 'Confira o endereço completo, valor, troco e taxa no BR⚡LN Signer. Aprove pelos botões.' },
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
    if(syncController || proposal)throw new Error('Aguarde a atualização ou encerre a proposta antes de sincronizar.')
    syncController = new AbortController()
    syncFailure=false
    try {
    syncMessage = 'Consultando o node. O BR⚡LN Signer pode permanecer desconectado.'
    const status = await api<{height:number;electrum_source:string}>('status', undefined, syncController.signal)
    if(source && source!==status.electrum_source){updatedAt=0;scanned=false;coins=[];history=[];clearSummary()}
    height=status.height; source=status.electrum_source
    if(!account)syncMessage=''
    if (account) {
      syncMessage = 'Buscando histórico e saldo. Isso pode levar alguns minutos.'
      const snapshot = await scanAccount(account, (checked, branch) => {
        syncMessage = `Sincronizando: ${checked} endereços consultados · ${branch === 0 ? 'recebimento' : 'troco'}. Aguarde.`
      }, syncController.signal)
      syncController.signal.throwIfAborted()
      persist({...account, receiveIndex:Math.max(account.receiveIndex,snapshot.receiveIndex), changeIndex:Math.max(account.changeIndex,snapshot.changeIndex)})
      coins = snapshot.utxos; history = snapshot.history; scanned = true
      updatedAt=Date.now(); now=updatedAt; cachedBalance=coins.reduce((sum,c)=>sum+c.value,0)
      if(source==='local'||source==='club')saveSummary(account,{source,updatedAt,balance:cachedBalance,history})
      syncMessage = 'Sincronização concluída. Saldo e histórico atualizados.'
    }
    } catch (error) {
      const failure=syncController.signal.aborted ? new Error('Sincronização cancelada. Nenhum resultado parcial foi aplicado.') : error
      syncFailure=true;syncMessage=failure instanceof Error?failure.message:'Falha na sincronização.'
      throw failure
    } finally { syncController = null }
  }
  async function synchronize() {
    if(syncController || proposal)return
    try { await refresh() } catch(error) { syncFailure=true; syncMessage=(error instanceof Error?error.message:'Falha na sincronização.')+(updatedAt?' A última consulta continua visível; os dados podem estar desatualizados.':'') }
  }
  async function sameDevice() {
    if (!account) throw new Error('Importe a conta pública primeiro.')
    const key = await device.getXpub('Mainnet', ACCOUNT_PATH)
    if (key.xpub !== account.xpub || key.fingerprint.toLowerCase() !== account.fingerprint) throw new Error('A conta não corresponde à carteira ou à passphrase desbloqueada no BR⚡LN Signer.')
  }
  async function importDevice() {
    if(syncController)throw new Error('Aguarde ou cancele a sincronização antes de trocar a conta.')
    const key = await device.getXpub('Mainnet', ACCOUNT_PATH)
    if (account && key.xpub !== account.xpub && !await askConfirmation('Substituir a conta pública neste navegador? Exporte a configuração atual antes.')) return
    persist({...key, id:'', name:'', accountPath:ACCOUNT_PATH, network:'Mainnet', type:'p2wpkh', receiveIndex:account?.xpub === key.xpub ? account.receiveIndex : 0, changeIndex:account?.xpub === key.xpub ? account.changeIndex : 0, createdAt:new Date().toISOString()})
    coins = []; history = []; scanned = false; proposal = null; signed = null; receive = ''; updatedAt=0; clearSummary()
    message = 'Conta pública importada. Exporte a configuração e sincronize com seu node.'
    void synchronize()
  }
  function download(name:string, data:string, type='application/json') {
    const url = URL.createObjectURL(new Blob([data],{type})); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000)
  }
  async function importConfig(event: Event) {
    if(syncController)throw new Error('Aguarde ou cancele a sincronização antes de trocar a conta.')
    const input = event.target as HTMLInputElement; const file = input.files?.[0]
    if (!file) return
    if (file.size > 8192) throw new Error('Configuração muito grande.')
    const value = publicAccount(JSON.parse(await file.text()))
    if (account && !await askConfirmation('Substituir a conta pública deste navegador?')) return
    persist(value); coins=[]; history=[]; scanned=false; receive=''; proposal=null; signed=null; input.value=''; updatedAt=0; clearSummary(); void synchronize()
  }
  async function showReceive() {
    if (!account || !updatedAt) throw new Error('Sincronize a conta antes de gerar um endereço.')
    await sameDevice()
    const next = deriveAddress(account!, 0, account!.receiveIndex)
    await device.verifyAddress('Mainnet', next.path, next.address)
    const qr = await QRCode.toDataURL(next.address, {width:256, margin:4, errorCorrectionLevel:'M'})
    persist({...account!, receiveIndex:account!.receiveIndex+1}); receive=next.address
    receiveQR=qr; receiveChecked=false
    message = 'Endereço exibido no BR⚡LN Signer. Compare todos os caracteres com o endereço abaixo.'
  }
  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    message='Copiado para a área de transferência.'
  }
  async function localAction(operation: 'unlock' | 'unlock-passphrase' | 'create' | 'restore' | 'backup') {
    message='Continue pelos dois botões do BR⚡LN Signer.'
    if (operation !== 'backup') { receive=''; proposal=null; signed=null }
    await device.local(operation)
    message=operation==='backup' ? 'Conferência do backup encerrada no BR⚡LN Signer.' :
      operation==='unlock-passphrase' ? 'Carteira com passphrase aberta. Importe sua conta pública para consultar esta carteira.' :
      operation==='unlock' ? 'Carteira desbloqueada, sem passphrase. Continue em Receber ou Enviar.' : 'Carteira pronta. Importe a conta pública do BR⚡LN Signer.'
  }
  async function prepare() {
    if (!account || !scanned) throw new Error('Sincronize a conta primeiro.')
    const previous=selected.slice(), destination=address.trim(), sendAmount=amount, sendRate=rate
    await refresh()
    const fresh=revalidateSelection(previous,coins)
    const result = await preparePayment(account, fresh, destination, sendAmount, sendRate, getTxHex)
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
    clearSummary(); updatedAt=0
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
    if(account){const cached=loadSummary(account);if(cached){updatedAt=cached.updatedAt;cachedBalance=cached.balance;history=cached.history;source=cached.source}}
    void synchronize()
    const clock=window.setInterval(()=>now=Date.now(),30000)
    return () => { clearInterval(clock); resolveConfirmation?.(false); window.removeEventListener('hashchange', initializeAppearance); syncController?.abort(); void device.disconnect() }
  })
</script>

<svelte:head><link rel="stylesheet" href="/los-theme/theme.css" /><title>BR⚡LN Hardwallet</title><meta name="description" content="Coordenador Bitcoin local com assinador ESP32 e BR⚡LN LightningOS" /></svelte:head>
<main>
  <dialog bind:this={confirmation} on:close={finishConfirmation} aria-labelledby="confirmation-title"><form method="dialog"><h2 id="confirmation-title">Confira antes de continuar</h2><p>{confirmationText}</p><div class="buttons"><button class="secondary" value="cancel">Cancelar</button><button value="accept">Sim, confirmo</button></div></form></dialog>
  <header><div class="brand"><img src="/brln-logo.png" alt="BR⚡LN" /><div><h1>Hardwallet</h1><small>BR⚡LN LightningOS + BR⚡LN Signer</small></div></div><span class="badge">PILOTO EXPERIMENTAL</span></header>
  <p class="intro">O BR⚡LN LightningOS consulta a blockchain. O BR⚡LN Signer confere e assina. Seed, senha e passphrase são digitadas somente pelos botões do BR⚡LN Signer.</p>
  <aside>Protótipo sem auditoria independente e sem validação física concluída. Use uma carteira de laboratório, sem fundos reais. USB não é air gap. Esta aplicação não controla o saldo nem os canais do LND.</aside>
  <div class="status"><span>Node · {height === null ? 'indisponível' : 'bloco ' + height}</span><span>Electrum · {source==='club' ? 'clube · servidor público' : source==='local' ? 'meu node' : 'não consultado'}</span><span>BR⚡LN Signer · {connected ? unlocked ? 'desbloqueado' : 'bloqueado' : 'desconectado'}</span><span>Bitcoin mainnet · BIP84</span></div>
  {#if source==='club'}<p>O BR⚡LN LightningOS consulta o servidor público electrum.br-ln.com:50001 pela internet. Essa conexão usa TCP sem TLS: o servidor e intermediários de rede podem observar suas consultas. As chaves continuam no BR⚡LN Signer. A escolha do servidor é feita na loja do BR⚡LN LightningOS, sem fallback automático.</p>{/if}
  <p class:failure role="status" aria-live="polite" hidden={!message}>{busy ? 'Em andamento · ' : ''}{message}</p>
  <p role="status" class:failure={syncFailure} aria-live="polite" hidden={!syncMessage}>{syncMessage}</p>
  {#if syncController}<button class="secondary" on:click={() => syncController?.abort()}>Cancelar sincronização</button>{/if}
  <FirmwareInstaller bind:busy {connected} hasProposal={!!proposal} />
  <section class="section-card"><h2>01 <span>Conectar o BR⚡LN Signer</span></h2><p>Com o firmware já instalado, conecte o BR⚡LN Signer por USB a este computador. Use Chromium, Chrome ou Edge com HTTPS confiável e confira o código de pareamento na tela do BR⚡LN Signer.</p>
    <div class="buttons"><button disabled={busy || connected} on:click={() => run(() => device.connect())}>Conectar por USB</button><button class="secondary" disabled={busy || !connected} on:click={() => run(() => device.disconnect())}>Desconectar</button></div>
    {#if connected}<div class="buttons">{#each operations as operation}<button class="secondary" disabled={busy || !!proposal || (operation.id==='backup' && !unlocked)} on:click={() => run(() => localAction(operation.id))}>{operation.label}</button>{/each}<button class="secondary" disabled={busy || !unlocked} on:click={() => run(() => device.logout())}>Bloquear</button></div>{/if}
    <p>Desbloqueie com a senha no BR⚡LN Signer e aguarde. O desbloqueio normal abre sua carteira sem passphrase BIP39.</p>
    <details><summary>Avançado · abrir carteira com passphrase</summary>
      <p>Cada passphrase abre uma carteira diferente. Não é a senha do BR⚡LN Signer e não existe aviso de passphrase incorreta. Você precisará das mesmas palavras e da mesma passphrase em cada abertura ou recuperação.</p>
      <p>Digite a passphrase somente no BR⚡LN Signer. Depois importe a conta pública dessa carteira; a conta atual não será substituída automaticamente.</p>
      <button class="secondary" disabled={busy || !connected || !!proposal} on:click={() => run(() => localAction('unlock-passphrase'))}>Abrir carteira com passphrase</button>
    </details>
  </section>
  <section class="section-card"><h2>02 <span>Minha carteira Bitcoin</span></h2>
    {#if account}<p>{balanceLabel}</p>{#if updatedAt}<p class="updated">{updatedLabel(updatedAt,now)} · {new Date(updatedAt).toLocaleString('pt-BR')}<br />{syncController ? 'Atualizando em segundo plano. Você pode usar o BR⚡LN Signer.' : 'Consulta salva neste navegador; o saldo pode ter mudado.'}</p>{/if}<p class="mono">Conta {account.fingerprint} · {account.accountPath}</p><button disabled={busy || !!syncController || !!proposal} on:click={() => synchronize()}>Sincronizar com Electrum selecionado</button>{:else}<p>Importe a conta pública do BR⚡LN Signer ou seu arquivo de configuração para começar.</p>{/if}
    <details open={!account}><summary>Conta pública e backup</summary>
      <p>A configuração pública permite consultar saldo e histórico com o BR⚡LN Signer desconectado. Ela revela sua atividade financeira; guarde-a com privacidade. O backup das palavras fica offline.</p>
      <div class="buttons"><button disabled={busy || !!syncController || !unlocked || !!proposal} on:click={() => run(importDevice)}>Importar do BR⚡LN Signer</button><label class="file">Importar configuração pública<input type="file" accept="application/json,.json" disabled={busy || !!syncController || !!proposal} on:change={event => run(() => importConfig(event))} /></label><button class="secondary" disabled={busy || !account} on:click={() => account && download('brln-conta-publica.json',JSON.stringify(publicAccount(account),null,2))}>Exportar configuração</button></div>
      {#if account}<p class="mono">{account.xpub}</p>{/if}
    </details>
  </section>
  <nav class="buttons" aria-label="Carteira Bitcoin">
    <button class:secondary={tab!=='receive'} aria-pressed={tab==='receive'} on:click={() => tab='receive'}>Receber</button>
    <button class:secondary={tab!=='send'} aria-pressed={tab==='send'} on:click={() => tab='send'}>Enviar</button>
    <button class:secondary={tab!=='history'} aria-pressed={tab==='history'} on:click={() => tab='history'}>Histórico</button>
  </nav>
  {#if tab==='receive'}<section class="section-card"><h2><span>Receber Bitcoin</span></h2>
    <p>Sincronize a conta, conecte e desbloqueie o BR⚡LN Signer. Compare o endereço completo no BR⚡LN Signer antes de compartilhá-lo.</p>
    <button class="secondary" disabled={busy || !updatedAt || !unlocked || !!proposal} on:click={() => run(showReceive)}>Conferir endereço para receber</button>
    {#if receive}<div class="receive"><p class="mono">{receive}</p>
      <label><input type="checkbox" bind:checked={receiveChecked} /> Conferi todos os caracteres no BR⚡LN Signer e são iguais.</label>
      {#if receiveChecked}<img class="receive-qr" src={receiveQR} alt="QR code do endereço Bitcoin conferido" width="256" height="256" /><button class="secondary" on:click={() => run(() => copy(receive))}>Copiar endereço</button>{/if}
    </div>{/if}
  </section>{/if}
  {#if tab==='history'}<section class="section-card"><h2><span>Histórico</span></h2>
    {#if !updatedAt}<p>Sincronize a conta para consultar o histórico.</p>{:else if !history.length}<p>Nenhuma transação encontrada nesta conta.</p>{:else}<ul class="transactions">{#each history as tx}<li><p>{tx.height>0 ? `Confirmada no bloco ${tx.height}` : 'Não confirmada'}</p><p class="mono">{tx.txid}</p><button class="secondary" disabled={busy} on:click={() => run(() => copy(tx.txid))}>Copiar ID da transação</button></li>{/each}</ul>{/if}
  </section>{/if}
  {#if tab==='send'}
  <section class="section-card"><h2><span>Enviar Bitcoin</span></h2><p>Antes de preparar, os fundos selecionados serão consultados novamente. Confira e assine no BR⚡LN Signer. A transmissão exige uma confirmação separada.</p>{#if scanned && !coins.length}<p>Nenhum saldo disponível para enviar nesta conta.</p>{/if}
    {#if coins.length}<fieldset disabled={busy || !!syncController || !!proposal}><legend>UTXOs · somente confirmados podem ser gastos</legend>{#each coins as coin}<label class="coin"><input type="checkbox" bind:checked={coin.selected} disabled={!coin.status.confirmed} /><span>{coin.value.toLocaleString('pt-BR')} sats <small class="mono">{coin.txid}:{coin.vout}</small></span></label>{/each}</fieldset>{/if}
    <fieldset disabled={busy || !!syncController || !!proposal || !scanned}><label>Endereço de destino<input bind:value={address} autocomplete="off" spellcheck="false" placeholder="bc1…" /></label><div class="fields"><label>Valor em sats<input type="number" bind:value={amount} min="1" step="1" /></label><label>Taxa em sat/vB<input type="number" bind:value={rate} min="1" max="1000" step="0.1" /></label></div><div class="buttons"><button class="secondary" on:click={() => run(async () => {rate=(await api<{sat_per_vbyte:number}>('fees')).sat_per_vbyte})}>Consultar taxa no node</button><button disabled={!selected.length} on:click={() => run(prepare)}>Preparar transação</button></div></fieldset>
    {#if proposal}<div class="review"><h3>Proposta congelada</h3>{#each proposal.outputs as output}<p><strong>{output.change ? 'Troco' : 'Destino'} · {output.amount.toLocaleString('pt-BR')} sats</strong><br /><span class="mono">{output.address}</span></p>{/each}<p>Taxa: <strong>{proposal.fee} sats</strong> · estimativa {proposal.feeRate.toFixed(2)} sat/vB</p><div class="buttons"><button disabled={busy || !unlocked || !!signed} on:click={() => run(sign)}>Conferir e assinar no BR⚡LN Signer</button><button class="secondary" disabled={busy || broadcastState==='unknown'} on:click={() => {proposal=null; signed=null; coins=[]; scanned=false; message='Proposta encerrada. Sincronize a conta antes de preparar outra.'}}>Encerrar proposta</button></div></div>{/if}
    {#if signed}<div class="review"><h3>Assinatura verificada</h3><p class="mono">{signed.txid}</p><p>Taxa final: {signed.fee} sats · {signed.feeRate.toFixed(2)} sat/vB</p><div class="buttons"><button disabled={busy || broadcastState==='done'} on:click={() => run(broadcast)}>{broadcastState==='unknown' ? 'Consultar resultado no node' : broadcastState==='done' ? 'Transmitida' : 'Transmitir pelo Electrum selecionado'}</button><button class="secondary" on:click={() => signed && download('brln-' + signed.txid + '.hex',signed.hex,'text/plain')}>Exportar transação assinada</button></div></div>{/if}
  </section>
  {/if}
  <footer>BRLN · Código aberto · Sem custódia do clube<br />O protótipo usa ESP32 da Espressif. A portabilidade do backup é independente deste BR⚡LN Signer e do BR⚡LN LightningOS.</footer>
</main>

<style>
  dialog{max-width:520px;width:calc(100% - 32px);color:rgb(var(--color-fog));background:rgb(var(--color-ink));border:1px solid rgb(var(--color-glow)/.5);border-radius:16px;padding:24px}dialog::backdrop{background:#000a}
  details{margin:18px 0}summary{cursor:pointer;font-weight:650;padding:10px 0}.receive-qr{display:block;margin:20px 0;background:white;border-radius:8px;max-width:100%;height:auto}.transactions{list-style:none;padding:0}.transactions li{padding:16px 0;border-bottom:1px solid rgb(var(--color-fog)/.2)}
  :global(*){box-sizing:border-box} :global(body){margin:0;line-height:1.6}main{max-width:1120px;margin:auto;padding:24px}header,.status,.buttons,.fields{display:flex;align-items:center;gap:16px;flex-wrap:wrap}header{justify-content:space-between;margin-bottom:20px}.brand{display:flex;align-items:center;gap:18px}.brand img{width:112px;padding:8px;background:#08111f;border-radius:12px}.brand h1{font-size:25px;margin:0;font-weight:700}.brand small{display:block;color:rgb(var(--color-fog)/.7);font-size:11px;letter-spacing:1px}.badge{font-size:11px;border:1px solid rgb(var(--color-brass)/.5);color:rgb(var(--color-fog));border-radius:20px;padding:4px 12px}.intro{max-width:850px;color:rgb(var(--color-fog)/.8);font-size:15px;margin:10px 0}aside{border-left:3px solid rgb(var(--color-brass));padding:10px 16px;background:rgb(var(--color-brass)/.08);font-size:13px}.status{font-size:13px;color:rgb(var(--color-fog)/.75);margin:16px 0}section{margin:20px 0;padding:22px}h2{color:rgb(var(--color-glow));font-size:15px;margin:0 0 12px}h2 span{color:rgb(var(--color-fog));font-size:22px;margin-left:12px}p{overflow-wrap:anywhere}section>p{color:rgb(var(--color-fog)/.8)}.buttons{margin:16px 0;gap:10px}button,.file{background:rgb(var(--color-glow));color:#08111f;border:1px solid rgb(var(--color-glow));padding:10px 15px;border-radius:8px;font-weight:650;font-size:14px;font-family:inherit;cursor:pointer}button.secondary,.file{background:transparent;color:rgb(var(--color-fog));border-color:rgb(var(--color-fog)/.25)}button:disabled,input:disabled,fieldset:disabled{opacity:.5;cursor:default}input:not([type=checkbox]){display:block;width:100%;padding:12px;background:rgb(var(--color-ink)/.7);color:rgb(var(--color-fog));border:1px solid rgb(var(--color-fog)/.25);border-radius:8px;margin-top:7px;font:inherit}input[type=file]{font-size:12px}.file{max-width:280px}fieldset{border:0;padding:0;margin:20px 0}label{display:block;font-size:14px}.fields>label{flex:1;min-width:160px;margin-top:18px}.coin{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid rgb(var(--color-fog)/.15)}.coin small{display:block;overflow-wrap:anywhere}.coin span{min-width:0}.mono{font-family:ui-monospace,monospace;font-size:13px;overflow-wrap:anywhere}.review,.receive{background:rgb(var(--color-glow)/.06);border:1px solid rgb(var(--color-glow)/.25);border-radius:8px;padding:20px;margin-top:20px}[role=status]{padding:12px;background:rgb(var(--color-glow)/.12);border-radius:8px}.failure{background:rgb(var(--color-ember)/.15)!important;border-left:3px solid rgb(var(--color-ember))}footer{color:rgb(var(--color-fog)/.65);font-size:12px;padding:20px 0}button:focus-visible,input:focus-visible{outline:3px solid rgb(var(--color-glow));outline-offset:3px}@media(max-width:600px){main{padding:16px}section{padding:16px}h2 span{font-size:19px}.brand img{width:90px}.brand h1{font-size:22px}}
</style>
