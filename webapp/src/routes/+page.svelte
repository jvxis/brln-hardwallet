<script lang="ts">
  import { onMount } from 'svelte'
  import QRCode from 'qrcode'
  import { initializeAppearance, rememberDisplay } from '$lib/appearance'
  import { t, num, dateTime } from '$lib/i18n'
  import { reportHeight, reveal, parseDisplayMessage } from '$lib/embed'
  import { BRLNDevice } from '$lib/brln-device'
  import FirmwareInstaller from '$lib/FirmwareInstaller.svelte'
  import { api, scanAccount, getTxHex } from '$lib/brln-chain'
  import { ACCOUNT_INDEX_LIMIT, ACCOUNT_PATH, publicAccount, preparePayment } from '$lib/brln-wallet'
  import { deriveAddress, finalizePsbt } from '$lib/bitcoin'
  import { loadAccounts, saveAccounts } from '$lib/storage'
  import { loadSummary, saveSummary, clearSummary, revalidateSelection } from '$lib/brln-snapshot'
  import type { WalletAccount, UtxoRecord, UnsignedTransaction } from '$lib/types'

  let connected = false, unlocked = false, busy = false, message = '', failure = false
  let account: WalletAccount | null = null
  let coins: UtxoRecord[] = [], history: Array<{txid:string;height:number}> = []
  let height: number | null = null, scanned = false, address = '', amount = 0, rate = 1, sendAll = false
  let source = ''
  let updatedAt=0, now=Date.now(), cachedBalance=0, syncMessage='', syncFailure=false
  let view: 'setup' | 'wallet' | 'settings' = 'setup'
  let tab: 'receive' | 'send' | 'history' = 'receive'
  let step = 1, firmwareDone = false, firmwareSkipped = false
  let receiveQR = '', receiveChecked = false
  let confirmation: HTMLDialogElement
  let confirmationText = '', dialogTop = 0
  let page: HTMLElement
  let resolveConfirmation: ((accepted:boolean)=>void) | null = null
  function askConfirmation(text:string): Promise<boolean> {
    confirmationText=text
    confirmation.returnValue='cancel'
    // Inside the LightningOS iframe the viewport is the whole page: open the
    // dialog beside the control that triggered it and ask LightningOS to show it.
    const anchor = (document.activeElement as HTMLElement | null)?.getBoundingClientRect()
    dialogTop = Math.max(16, Math.min((anchor?.top ?? 120) - 60, Math.max(16, (page?.getBoundingClientRect().height ?? 0) - 320)))
    reveal(dialogTop)
    return new Promise(resolve => { resolveConfirmation=resolve; confirmation.showModal() })
  }
  function finishConfirmation() {
    resolveConfirmation?.(confirmation.returnValue==='accept'); resolveConfirmation=null
  }
  $: if (!receive) { receiveQR = ''; receiveChecked = false }
  let syncController: AbortController | null = null
  let receive = '', proposal: UnsignedTransaction | null = null
  let signed: ReturnType<typeof finalizePsbt> | null = null
  let broadcastState: 'new' | 'unknown' | 'done' = 'new'
  // A broadcast proposal no longer holds coins, so it does not block a sync.
  $: holdsCoins = !!proposal && broadcastState !== 'done'
  const device = new BRLNDevice({
    confirmPair: code => askConfirmation('Confira o código ' + code + ' na tela do BR⚡LN Signer. Os códigos são iguais?'),
    psbtReview: step => { if (step) message = 'Confira o endereço completo, valor, troco e taxa no BR⚡LN Signer. Aprove pelos botões.' },
    log: () => {}, state: () => { connected = device.connected; unlocked = device.authenticated },
  })
  $: balance = coins.reduce((sum, coin) => sum + coin.value, 0)
  $: shownBalance = scanned ? balance : cachedBalance
  $: selected = coins.filter(coin => coin.selected)
  // Setup checklist, derived from real state rather than from clicks.
  $: firmwareReady = firmwareDone || firmwareSkipped || connected || !!account
  $: walletReady = unlocked && !!account
  $: steps = [
    { n: 1, title: 'Firmware', detail: firmwareDone ? 'Instalado e verificado' : firmwareReady ? 'Já instalado' : 'Instalar pelo navegador', done: firmwareReady },
    { n: 2, title: 'Conectar', detail: connected ? 'Pareado por USB' : 'Parear por USB', done: connected },
    { n: 3, title: 'Carteira', detail: walletReady ? 'Aberta e conta pública salva' : 'Criar, recuperar ou desbloquear', done: walletReady },
    { n: 4, title: 'Pronto', detail: account ? 'Conta {fingerprint}' : 'Resumo e backup', done: walletReady },
  ]
  $: signerLabel = connected ? unlocked ? 'Desbloqueado' : 'Bloqueado' : 'Desconectado'
  function ago(at: number, current: number) {
    const minutes = Math.max(0, Math.floor((current - at) / 60000))
    return minutes === 0 ? $t('Atualizado há menos de 1 minuto') : minutes < 60 ? $t('Atualizado há {n} min', { n: minutes }) : $t('Última atualização: {date}', { date: $dateTime(at) })
  }
  $: sourceLabel = source === 'club' ? 'Electrum do clube' : source === 'local' ? 'Electrum do meu node' : 'Electrum'
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
      syncMessage = 'Buscando histórico e saldo.'
      const snapshot = await scanAccount(account, (checked, branch) => {
        syncMessage = `Sincronizando: ${checked} endereços consultados · ${branch === 0 ? 'recebimento' : 'troco'}.`
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
    if(syncController || holdsCoins)return
    try { await refresh() } catch(error) { syncFailure=true; syncMessage=(error instanceof Error?error.message:'Falha na sincronização.')+(updatedAt?' A última consulta continua visível; os dados podem estar desatualizados.':'') }
  }
  async function sameDevice() {
    if (!account) throw new Error('Configure o BR⚡LN Signer primeiro: a conta pública ainda não foi salva neste navegador.')
    const key = await device.getXpub('Mainnet', ACCOUNT_PATH)
    if (key.xpub !== account.xpub || key.fingerprint.toLowerCase() !== account.fingerprint) throw new Error('A conta não corresponde à carteira ou à passphrase desbloqueada no BR⚡LN Signer.')
  }
  // Read the public account from the unlocked Signer and keep it in this browser.
  // A different account is only replaced after an explicit confirmation.
  async function adoptSignerAccount(reason: string) {
    // Let a running scan finish cancelling, so the new account is synchronized.
    syncController?.abort()
    for (let i = 0; syncController && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 50))
    const key = await device.getXpub('Mainnet', ACCOUNT_PATH)
    const same = account?.xpub === key.xpub
    if (account && !same && !await askConfirmation(reason)) { message='A conta pública salva neste navegador foi mantida.'; return false }
    persist({...key, id:'', name:'', accountPath:ACCOUNT_PATH, network:'Mainnet', type:'p2wpkh', receiveIndex:same ? account!.receiveIndex : 0, changeIndex:same ? account!.changeIndex : 0, createdAt:new Date().toISOString()})
    if (!same) { coins = []; history = []; scanned = false; proposal = null; signed = null; receive = ''; updatedAt=0; cachedBalance=0; clearSummary() }
    void synchronize()
    return true
  }
  async function importDevice() {
    await adoptSignerAccount('Substituir a conta pública salva neste navegador pela conta aberta no BR⚡LN Signer?')
    message = 'Conta pública do BR⚡LN Signer salva neste navegador.'
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
    message='Configuração pública importada.'
  }
  async function showReceive() {
    if (!account || !updatedAt) throw new Error('Sincronize a conta antes de gerar um endereço.')
    if (account.receiveIndex >= ACCOUNT_INDEX_LIMIT) throw new Error(`Os ${ACCOUNT_INDEX_LIMIT} endereços de recebimento do piloto já foram usados. Use um coordenador compatível com esta conta pública.`)
    await sameDevice()
    const next = deriveAddress(account!, 0, account!.receiveIndex)
    await device.verifyAddress('Mainnet', next.path, next.address)
    const qr = await QRCode.toDataURL(next.address, {width:256, margin:4, errorCorrectionLevel:'M'})
    persist({...account!, receiveIndex:account!.receiveIndex+1}); receive=next.address
    receiveQR=qr; receiveChecked=false
    message = 'Endereço exibido no BR⚡LN Signer. Compare todos os caracteres com o endereço ao lado.'
  }
  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    message='Copiado para a área de transferência.'
  }
  async function connectSigner() {
    await device.connect()
    message = 'BR⚡LN Signer pareado. O canal USB é cifrado e autenticado.'
    if (view === 'setup' && step === 2) step = 3
  }
  async function localAction(operation: 'unlock' | 'unlock-passphrase' | 'create' | 'restore' | 'backup') {
    message='Continue pelos dois botões do BR⚡LN Signer.'
    // Only operations that can open another wallet discard the current work; a
    // normal unlock keeps the frozen proposal (signing re-checks the account).
    if (operation === 'create' || operation === 'restore' || operation === 'unlock-passphrase') { receive=''; proposal=null; signed=null }
    await device.local(operation)
    if (operation === 'backup') { message='Conferência do backup encerrada no BR⚡LN Signer.'; return }
    const adopted = await adoptSignerAccount(operation === 'unlock-passphrase'
      ? 'Esta passphrase abre outra carteira. Usar a conta pública dela neste navegador? A conta salva atualmente será substituída.'
      : 'O BR⚡LN Signer abriu uma carteira diferente da conta salva neste navegador. Substituir a conta pública salva?')
    message = operation === 'create' ? 'Carteira criada e conta pública salva. Guarde as 24 palavras offline.' :
      operation === 'restore' ? 'Carteira recuperada e conta pública salva. Confira se o saldo e os endereços conferem.' :
      operation === 'unlock-passphrase' ? 'Carteira com passphrase aberta.' : 'Carteira desbloqueada.'
    if (adopted && view === 'setup') step = 4
  }
  async function prepare() {
    if (!account || !scanned) throw new Error('Sincronize a conta primeiro.')
    const previous=selected.slice(), destination=address.trim(), sendAmount=amount, sendRate=rate, sweep=sendAll
    await refresh()
    // The refresh marks every confirmed coin; keep the user's selection instead.
    coins=coins.map(coin=>({...coin, selected:previous.some(p=>p.txid===coin.txid && p.vout===coin.vout)}))
    const fresh=revalidateSelection(previous,coins)
    const result = await preparePayment(account!, fresh, destination, sendAmount, sendRate, getTxHex, {sendAll:sweep})
    if (result.highFee && !await askConfirmation(`A taxa de ${result.transaction.fee.toLocaleString('pt-BR')} sats passa de 10% do valor enviado. Deseja continuar mesmo assim?`)) { message='Proposta descartada. Ajuste o valor ou a taxa.'; return }
    persist({...account!, changeIndex:result.changeIndex})
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
      await getTxHex(expected); broadcasted('Transação encontrada no node.'); return
    }
    broadcastState='unknown'
    clearSummary(); updatedAt=0
    try {
      const result = await api<{txid:string}>('broadcast',{hex:signed.hex})
      if (result.txid !== expected) throw new Error('Txid divergente.')
    } catch { throw new Error('Resultado desconhecido. Consulte o txid ' + expected + ' antes de qualquer nova tentativa. Você pode exportar a transação assinada.') }
    broadcasted('Transação transmitida ao seu node.')
  }
  // The spent coins are gone: refresh balance and history while the summary stays
  // visible, and start the next send from an empty form.
  function broadcasted(text: string) {
    broadcastState='done'; message=text; coins=[]; scanned=false; syncMessage=''
    address=''; amount=0; sendAll=false
    void refresh().catch(() => { /* refresh reports its own failure */ })
  }
  function closeProposal() {
    const fresh = broadcastState === 'done' && scanned
    proposal=null; signed=null
    if (fresh) { message='Proposta encerrada.'; return }
    coins=[]; scanned=false; message='Proposta encerrada. Sincronize a conta antes de preparar outra.'
  }
  onMount(() => {
    initializeAppearance()
    window.addEventListener('hashchange', initializeAppearance)
    const display = (event: MessageEvent) => { const update = parseDisplayMessage(event); if (update) rememberDisplay(update.appearance, update.lang) }
    window.addEventListener('message', display)
    const stopHeight = reportHeight(page)
    try { const saved = loadAccounts()[0]; if (saved) account=publicAccount(saved) } catch { message='Configuração local inválida. Importe novamente a conta pública.'; failure=true }
    if(account){const cached=loadSummary(account);if(cached){updatedAt=cached.updatedAt;cachedBalance=cached.balance;history=cached.history;source=cached.source}}
    view = account ? 'wallet' : 'setup'
    void synchronize()
    const clock=window.setInterval(()=>now=Date.now(),30000)
    return () => { clearInterval(clock); stopHeight(); window.removeEventListener('message', display); resolveConfirmation?.(false); window.removeEventListener('hashchange', initializeAppearance); syncController?.abort(); void device.disconnect() }
  })
</script>

<svelte:head><link rel="stylesheet" href="/los-theme/theme.css" /><title>BR⚡LN Hardwallet</title><meta name="description" content="Coordenador Bitcoin local com assinador ESP32 e BR⚡LN LightningOS" /></svelte:head>

<dialog bind:this={confirmation} on:close={finishConfirmation} aria-labelledby="confirmation-title" style="top:{dialogTop}px"><form method="dialog"><p class="eyebrow">{$t('Confirmação')}</p><h2 id="confirmation-title">{$t('Confira antes de continuar')}</h2><p>{$t(confirmationText)}</p><div class="actions end"><button class="btn-secondary" value="cancel">{$t('Cancelar')}</button><button class="btn-primary" value="accept">{$t('Sim, confirmo')}</button></div></form></dialog>

<main bind:this={page}>
  <header class="hero">
    <div class="hero-main">
      <img src="/brln-logo.png" alt="BR⚡LN" />
      <div>
        <p class="eyebrow">{$t('Carteira Bitcoin com assinador físico')}</p>
        <h1>{$t('Hardwallet BR⚡LN')}</h1>
        <p class="lead">{$t('O BR⚡LN LightningOS consulta a blockchain; o BR⚡LN Signer confere e assina. Seed, senha e passphrase só entram pelos botões do Signer.')}</p>
        <div class="chips"><span>{$t('Chaves no Signer')}</span><span>{$t('Sem custódia do clube')}</span><span>{$t('Mainnet · BIP84')}</span><span class="warn">{$t('Piloto experimental')}</span></div>
      </div>
    </div>
    <div class="flow">
      <div><span>{$t('Seu node')}</span><strong>{height === null ? 'LightningOS' : $t('Bloco {height}', { height: $num(height) })}</strong></div>
      <i aria-hidden="true"></i>
      <div><span>{$t('Signer')}</span><strong>{$t(signerLabel)}</strong></div>
    </div>
  </header>

  <section class="stats" aria-label={$t('Resumo')}>
    <div class="stat"><span>{$t('Saldo')}</span><strong>{updatedAt ? $num(shownBalance) + ' sats' : '—'}</strong><small>{updatedAt ? ago(updatedAt, now) : account ? $t('Ainda não sincronizado') : $t('Configure o Signer')}</small></div>
    <div class="stat"><span>{$t('BR⚡LN Signer')}</span><strong class:good={unlocked} class:mid={connected && !unlocked}>{$t(signerLabel)}</strong><small>{$t(connected ? unlocked ? 'Pronto para conferir e assinar' : 'Desbloqueie para assinar' : 'Conecte por USB quando precisar assinar')}</small>
      <div class="stat-actions">
        {#if !connected}<button class="btn-primary tiny" disabled={busy} on:click={() => run(connectSigner)}>{$t('Conectar por USB')}</button>
        {:else if !unlocked}<button class="btn-primary tiny" on:click={() => run(() => localAction('unlock'))}>{$t('Desbloquear')}</button><button class="btn-secondary tiny" disabled={busy} on:click={() => run(() => device.disconnect())}>{$t('Desconectar')}</button>
        {:else}<button class="btn-secondary tiny" disabled={busy} on:click={() => run(() => device.logout())}>{$t('Bloquear')}</button>{/if}
      </div>
    </div>
    <div class="stat"><span>{$t('Fonte')}</span><strong>{$t(sourceLabel)}</strong><small>{$t(source === 'club' ? 'Servidor público · TCP sem TLS' : source === 'local' ? 'Consultas ficam no seu node' : 'Consultando…')}</small></div>
    <div class="stat"><span>{$t('Conta pública')}</span><strong class="mono">{account ? account.fingerprint : '—'}</strong><small>{account ? ACCOUNT_PATH : $t('Salva ao abrir a carteira')}</small></div>
  </section>

  <nav class="pills">
    <button aria-pressed={view === 'setup'} class:on={view === 'setup'} on:click={() => view = 'setup'}>{$t('Configurar Signer')}</button>
    <button aria-pressed={view === 'wallet'} class:on={view === 'wallet'} on:click={() => view = 'wallet'}>{$t('Carteira')}</button>
    <button aria-pressed={view === 'settings'} class:on={view === 'settings'} on:click={() => view = 'settings'}>{$t('Ajustes')}</button>
  </nav>

  {#if message}<p class="banner" class:failure role="status" aria-live="polite">{busy ? $t('Em andamento') + ' · ' : ''}{$t(message)}</p>{/if}
  {#if syncMessage}<div class="banner subtle" class:failure={syncFailure} role="status" aria-live="polite"><span>{$t(syncMessage)}</span>{#if syncController}<button class="link" on:click={() => syncController?.abort()}>{$t('Cancelar sincronização')}</button>{/if}</div>{/if}

  {#if view === 'setup'}
  <div class="grid">
    <section class="section-card card">
      <ol class="stepper">
        {#each steps as item}
          <li><button class:current={step === item.n} class:done={item.done} on:click={() => step = item.n}><b>{item.done ? '✓' : item.n}</b><span>{$t(item.title)}</span></button></li>
        {/each}
      </ol>
      {#if step === 1}
        <p class="eyebrow">{$t('Passo {n} de 4', { n: 1 })}</p><h2>{$t('Instale o firmware')}</h2>
        <p class="muted">{$t('Grave o firmware do BR⚡LN Signer pelo navegador, com a placa ligada a este computador. O LightningOS fornece e confere os arquivos.')}</p>
        <FirmwareInstaller bind:busy bind:done={firmwareDone} {connected} hasProposal={!!proposal} />
        <div class="actions end"><button class="btn-secondary" disabled={busy} on:click={() => { firmwareSkipped = true; step = 2 }}>{$t('Já tenho o firmware')}</button><button class="btn-primary" disabled={busy || !firmwareReady} on:click={() => step = 2}>{$t('Próximo')}</button></div>
      {:else if step === 2}
        <p class="eyebrow">{$t('Passo {n} de 4', { n: 2 })}</p><h2>{$t('Conecte o BR⚡LN Signer')}</h2>
        <p class="muted">{$t('Ligue o Signer por USB a este computador e use Chrome ou Edge. O app reinicia a placa e mostra um código de 8 dígitos: compare com a tela do Signer antes de confirmar.')}</p>
        <div class="callout"><b>1</b><span>{$t('Selecione a porta da T-Display no seletor do navegador.')}</span></div>
        <div class="callout"><b>2</b><span>{$t('Compare o código de pareamento no Signer e no app.')}</span></div>
        <div class="actions end">
          {#if connected}<button class="btn-secondary" disabled={busy} on:click={() => run(() => device.disconnect())}>{$t('Desconectar')}</button>{/if}
          <button class="btn-primary" disabled={busy || connected} on:click={() => run(connectSigner)}>{$t(connected ? 'Conectado' : 'Conectar por USB')}</button>
          {#if connected}<button class="btn-primary" on:click={() => step = 3}>{$t('Próximo')}</button>{/if}
        </div>
      {:else if step === 3}
        <p class="eyebrow">{$t('Passo {n} de 4', { n: 3 })}</p><h2>{$t('Abra sua carteira')}</h2>
        <p class="muted">{$t('Escolha no app e continue nos botões do Signer. Ao final, a conta pública é salva neste navegador automaticamente para consultar saldo e histórico sem o Signer.')}</p>
        {#if !connected}<div class="callout warn"><span>{$t('Conecte o Signer no passo 2 primeiro.')}</span><button class="btn-secondary" on:click={() => step = 2}>{$t('Ir para conectar')}</button></div>{/if}
        <div class="choices">
          <button class="choice" disabled={busy || !connected || !!proposal} on:click={() => run(() => localAction('create'))}><strong>{$t('Criar carteira nova')}</strong><span>{$t('Senha nos botões, seed gerada no Signer e 24 palavras para anotar.')}</span></button>
          <button class="choice" disabled={busy || !connected || !!proposal} on:click={() => run(() => localAction('restore'))}><strong>{$t('Recuperar carteira')}</strong><span>{$t('Digite 12 ou 24 palavras BIP39 nos botões do Signer.')}</span></button>
          <button class="choice" disabled={busy || !connected} on:click={() => run(() => localAction('unlock'))}><strong>{$t('Desbloquear carteira')}</strong><span>{$t('Este Signer já tem carteira: digite a senha nos botões.')}</span></button>
        </div>
      {:else}
        <p class="eyebrow">{$t('Passo {n} de 4', { n: 4 })}</p><h2>{$t(walletReady ? 'Tudo pronto' : 'Quase lá')}</h2>
        {#if account}
          <div class="summary"><div><span>{$t('Conta')}</span><strong class="mono">{account.fingerprint}</strong></div><div><span>{$t('Caminho')}</span><strong class="mono">{ACCOUNT_PATH}</strong></div><div><span>{$t('Signer')}</span><strong>{$t(signerLabel)}</strong></div></div>
          <p class="muted">{$t('Guarde as palavras offline. Elas recuperam a carteira em outro Signer ou em outra carteira compatível com BIP84. A configuração pública pode ser exportada em Ajustes.')}</p>
          <div class="actions end"><button class="btn-secondary" disabled={busy || !unlocked} on:click={() => run(() => localAction('backup'))}>{$t('Conferir backup no Signer')}</button><button class="btn-primary" on:click={() => { view = 'wallet'; tab = 'receive' }}>{$t('Ir para a carteira')}</button></div>
        {:else}<p class="muted">{$t('Abra uma carteira no passo 3 para salvar a conta pública.')}</p><div class="actions end"><button class="btn-primary" on:click={() => step = 3}>{$t('Voltar ao passo 3')}</button></div>{/if}
      {/if}
    </section>
    <aside class="section-card card side">
      <p class="eyebrow">{$t('Progresso')}</p><h3>{$t('Configuração do Signer')}</h3>
      <ul class="checklist">{#each steps as item}<li class:done={item.done}><b>{item.done ? '✓' : item.n}</b><div><strong>{$t(item.title)}</strong><span>{$t(item.detail, { fingerprint: account?.fingerprint ?? '' })}</span></div></li>{/each}</ul>
      <div class="note"><strong>{$t('Segurança')}</strong><span>{$t('Seed, senha e passphrase nunca passam pelo computador. O app só recebe a conta pública e as assinaturas.')}</span></div>
    </aside>
  </div>
  {/if}

  {#if view === 'wallet'}
  {#if !account}
    <section class="section-card card empty"><h2>{$t('Nenhuma carteira neste navegador')}</h2><p class="muted">{$t('Configure o BR⚡LN Signer para salvar a conta pública e acompanhar saldo e histórico.')}</p><button class="btn-primary" on:click={() => view = 'setup'}>{$t('Configurar Signer')}</button></section>
  {:else}
  <div class="grid">
    <section class="section-card card">
      <div class="row between">
        <nav class="pills small">
          <button aria-pressed={tab==='receive'} class:on={tab==='receive'} on:click={() => tab='receive'}>{$t('Receber')}</button>
          <button aria-pressed={tab==='send'} class:on={tab==='send'} on:click={() => tab='send'}>{$t('Enviar')}</button>
          <button aria-pressed={tab==='history'} class:on={tab==='history'} on:click={() => tab='history'}>{$t('Histórico')} <em>{history.length}</em></button>
        </nav>
        <button class="btn-secondary" disabled={busy || !!syncController || holdsCoins} on:click={() => synchronize()}>{$t('Sincronizar')}</button>
      </div>
      {#if tab === 'receive'}
        <p class="eyebrow">{$t('Receber')}</p><h2>{$t('Novo endereço conferido no Signer')}</h2>
        <p class="muted">{$t('O endereço só aparece aqui depois de exibido no BR⚡LN Signer. Compare todos os caracteres antes de compartilhar.')}</p>
        {#if !unlocked}<div class="callout warn"><span>{$t(connected ? 'Desbloqueie o Signer para conferir o endereço.' : 'Conecte e desbloqueie o Signer para conferir o endereço.')}</span>{#if connected}<button class="btn-secondary" disabled={busy} on:click={() => run(() => localAction('unlock'))}>{$t('Desbloquear')}</button>{:else}<button class="btn-secondary" disabled={busy} on:click={() => run(connectSigner)}>{$t('Conectar por USB')}</button>{/if}</div>{/if}
        <div class="actions"><button class="btn-primary" disabled={busy || !updatedAt || !unlocked || !!proposal} on:click={() => run(showReceive)}>{$t('Conferir endereço para receber')}</button></div>
        {#if receive}<div class="value"><span>{$t('Endereço')}</span><p class="mono big">{receive}</p><label class="check"><input type="checkbox" bind:checked={receiveChecked} /> {$t('Conferi todos os caracteres no BR⚡LN Signer e são iguais.')}</label></div>{/if}
      {:else if tab === 'send'}
        <p class="eyebrow">{$t('Enviar')}</p><h2>{$t('Prepare a transação')}</h2>
        <p class="muted">{$t('Os fundos selecionados são consultados de novo antes de preparar. Você confere e assina no Signer; a transmissão é uma ação separada.')}</p>
        {#if !unlocked}<div class="callout warn"><span>{$t(connected ? 'Desbloqueie o Signer para assinar.' : 'Conecte e desbloqueie o Signer para assinar.')}</span>{#if connected}<button class="btn-secondary" disabled={busy} on:click={() => run(() => localAction('unlock'))}>{$t('Desbloquear')}</button>{:else}<button class="btn-secondary" disabled={busy} on:click={() => run(connectSigner)}>{$t('Conectar por USB')}</button>{/if}</div>{/if}
        {#if scanned && !coins.length}<p class="muted">{$t('Nenhum saldo disponível para enviar nesta conta.')}</p>{/if}
        {#if coins.length}<fieldset class="coins" disabled={busy || !!syncController || !!proposal}><legend>{$t('UTXOs · somente confirmados podem ser gastos')}</legend>{#each coins as coin}<label class="coin"><input type="checkbox" bind:checked={coin.selected} disabled={!coin.status.confirmed} /><span><strong>{$num(coin.value)} sats</strong><small class="mono">{coin.txid}:{coin.vout}</small></span></label>{/each}</fieldset>{/if}
        <fieldset class="form" disabled={busy || !!syncController || !!proposal || !scanned}>
          <label class="field">{$t('Endereço de destino')}<input class="input-field" bind:value={address} autocomplete="off" spellcheck="false" placeholder="bc1…" /></label>
          <div class="two">
            <label class="field">{$t('Valor em sats')}<input class="input-field" type="number" bind:value={amount} min="1" step="1" disabled={sendAll} /></label>
            <label class="field">{$t('Taxa em sat/vB')}<div class="inline"><input class="input-field" type="number" bind:value={rate} min="1" max="1000" step="0.1" /><button type="button" class="btn-secondary" on:click={() => run(async () => {rate=(await api<{sat_per_vbyte:number}>('fees')).sat_per_vbyte})}>{$t('Consultar')}</button></div></label>
          </div>
          <label class="check"><input type="checkbox" bind:checked={sendAll} /> {$t('Enviar todo o saldo selecionado, sem troco (o valor é calculado descontando a taxa)')}</label>
          <div class="actions"><button type="button" class="btn-primary" disabled={!selected.length} on:click={() => run(prepare)}>{$t('Preparar transação')}</button></div>
        </fieldset>
      {:else}
        <p class="eyebrow">{$t('Histórico')}</p><h2>{$t('Transações desta conta')}</h2>
        {#if !updatedAt}<p class="muted">{$t('Sincronize a conta para consultar o histórico.')}</p>{:else if !history.length}<p class="muted">{$t('Nenhuma transação encontrada nesta conta.')}</p>{:else}<ul class="transactions">{#each history as tx}<li><div><strong>{tx.height>0 ? $t('Confirmada no bloco {height}', { height: $num(tx.height) }) : $t('Não confirmada')}</strong><small class="mono">{tx.txid}</small></div><button class="btn-secondary" disabled={busy} on:click={() => run(() => copy(tx.txid))}>{$t('Copiar ID')}</button></li>{/each}</ul>{/if}
      {/if}
    </section>
    <aside class="section-card card side">
      {#if tab === 'receive'}
        <p class="eyebrow">{$t('Compartilhar')}</p><h3>{$t('QR code')}</h3>
        {#if receive && receiveChecked}<img class="qr" src={receiveQR} alt={$t('QR code do endereço Bitcoin conferido')} width="256" height="256" /><button class="btn-secondary full" on:click={() => run(() => copy(receive))}>{$t('Copiar endereço')}</button>
        {:else}<div class="placeholder">{$t(receive ? 'Marque a conferência para liberar o QR e a cópia.' : 'Gere um endereço conferido no Signer.')}</div>{/if}
        <ul class="checklist small"><li class:done={connected}><b>{connected ? '✓' : '1'}</b><div><strong>{$t('Signer conectado')}</strong></div></li><li class:done={unlocked}><b>{unlocked ? '✓' : '2'}</b><div><strong>{$t('Carteira desbloqueada')}</strong></div></li><li class:done={!!receive}><b>{receive ? '✓' : '3'}</b><div><strong>{$t('Endereço exibido no Signer')}</strong></div></li><li class:done={receiveChecked}><b>{receiveChecked ? '✓' : '4'}</b><div><strong>{$t('Conferido por você')}</strong></div></li></ul>
      {:else if tab === 'send'}
        <p class="eyebrow">{$t('Revisão segura')}</p><h3>{$t(signed ? 'Assinatura verificada' : proposal ? 'Proposta congelada' : 'Plano da transação')}</h3>
        {#if proposal}
          {#each proposal.outputs as output}<div class="output"><span>{$t(output.change ? 'Troco' : 'Destino')} · {$num(output.amount)} sats</span><p class="mono">{output.address}</p></div>{/each}
          <div class="output"><span>{$t('Taxa')}</span><p>{$num(proposal.fee)} sats · {proposal.feeRate.toFixed(2)} sat/vB</p></div>
          {#if !signed}
            {#if !unlocked}<div class="callout warn"><span>{$t(connected ? 'Desbloqueie o Signer para assinar.' : 'Conecte e desbloqueie o Signer para assinar.')}</span>{#if connected}<button class="btn-secondary" disabled={busy} on:click={() => run(() => localAction('unlock'))}>{$t('Desbloquear')}</button>{:else}<button class="btn-secondary" disabled={busy} on:click={() => run(connectSigner)}>{$t('Conectar por USB')}</button>{/if}</div>{/if}
            <button class="btn-primary full" disabled={busy || !unlocked} on:click={() => run(sign)}>{$t('Conferir e assinar no BR⚡LN Signer')}</button>
          {:else}
            <div class="output"><span>{$t('Txid')}</span><p class="mono">{signed.txid}</p><p>{$t('Taxa final: {fee} sats · {rate} sat/vB', { fee: $num(signed.fee), rate: signed.feeRate.toFixed(2) })}</p></div>
            <button class="btn-primary full" disabled={busy || broadcastState==='done'} on:click={() => run(broadcast)}>{$t(broadcastState==='unknown' ? 'Consultar resultado no node' : broadcastState==='done' ? 'Transmitida' : 'Transmitir pelo Electrum selecionado')}</button>
            <button class="btn-secondary full" on:click={() => signed && download('brln-' + signed.txid + '.hex',signed.hex,'text/plain')}>{$t('Exportar transação assinada')}</button>
          {/if}
          <button class="link" disabled={busy || broadcastState==='unknown'} on:click={closeProposal}>{$t('Encerrar proposta')}</button>
        {:else}
          <ul class="checklist small"><li class:done={selected.length > 0}><b>{selected.length ? '✓' : '1'}</b><div><strong>{$t('UTXOs')}</strong><span>{$t('{count} selecionados · {amount} sats', { count: selected.length, amount: $num(selected.reduce((s,c)=>s+c.value,0)) })}</span></div></li><li class:done={address.trim().length > 0}><b>{address.trim() ? '✓' : '2'}</b><div><strong>{$t('Destino')}</strong><span>{$t('Um destinatário por transação')}</span></div></li><li class:done={sendAll || amount > 0}><b>{sendAll || amount > 0 ? '✓' : '3'}</b><div><strong>{$t('Valor')}</strong><span>{sendAll ? $t('Todo o saldo selecionado') : amount > 0 ? $num(amount) + ' sats' : $t('Informe o valor')}</span></div></li><li class:done={rate >= 1}><b>{rate >= 1 ? '✓' : '4'}</b><div><strong>{$t('Taxa')}</strong><span>{$t('{rate} sat/vB · acima de 10% pede confirmação', { rate })}</span></div></li></ul>
          <div class="note"><strong>{$t('Revise antes de assinar')}</strong><span>{$t('A proposta fica congelada: cada saída e a taxa aparecem aqui e na tela do Signer.')}</span></div>
        {/if}
      {:else}
        <p class="eyebrow">{$t('Resumo')}</p><h3>{$t('Atividade')}</h3>
        <div class="summary column"><div><span>{$t('Transações')}</span><strong>{history.length}</strong></div><div><span>{$t('Não confirmadas')}</span><strong>{history.filter(tx => tx.height <= 0).length}</strong></div><div><span>{$t('Última consulta')}</span><strong>{updatedAt ? $dateTime(updatedAt) : '—'}</strong></div></div>
      {/if}
    </aside>
  </div>
  {/if}
  {/if}

  {#if view === 'settings'}
  <div class="settings">
    <section class="section-card card">
      <p class="eyebrow">{$t('BR⚡LN Signer')}</p><h3>{$t('Conexão e carteira')}</h3>
      <p class="muted">{$t('Estado')}: <strong>{$t(signerLabel)}</strong>. {$t('Conectar reinicia a placa e pede um novo pareamento.')}</p>
      <div class="actions">
        <button class="btn-primary" disabled={busy || connected} on:click={() => run(connectSigner)}>{$t('Conectar por USB')}</button>
        <button class="btn-secondary" disabled={busy || !connected} on:click={() => run(() => device.disconnect())}>{$t('Desconectar')}</button>
        <button class="btn-secondary" disabled={busy || !connected} on:click={() => run(() => localAction('unlock'))}>{$t('Desbloquear carteira')}</button>
        <button class="btn-secondary" disabled={busy || !unlocked} on:click={() => run(() => device.logout())}>{$t('Bloquear')}</button>
        <button class="btn-secondary" disabled={busy || !unlocked} on:click={() => run(() => localAction('backup'))}>{$t('Conferir backup')}</button>
      </div>
    </section>
    <section class="section-card card">
      <p class="eyebrow">{$t('Avançado')}</p><h3>{$t('Carteira com passphrase')}</h3>
      <p class="muted">{$t('Cada passphrase abre uma carteira diferente; não é a senha do Signer e não há aviso de passphrase incorreta. Digite somente no Signer. A conta pública dessa carteira substitui a salva, após confirmação.')}</p>
      <div class="actions"><button class="btn-secondary" disabled={busy || !connected || !!proposal} on:click={() => run(() => localAction('unlock-passphrase'))}>{$t('Abrir carteira com passphrase')}</button></div>
    </section>
    <section class="section-card card">
      <p class="eyebrow">{$t('Conta pública')}</p><h3>{$t('Configuração e backup')}</h3>
      <p class="muted">{$t('Permite consultar saldo e histórico com o Signer desconectado e revela sua atividade financeira: guarde com privacidade. As palavras ficam offline.')}</p>
      {#if account}<p class="mono small-text">{account.xpub}</p>{/if}
      <div class="actions">
        <button class="btn-secondary" disabled={busy || !!syncController || !unlocked || !!proposal} on:click={() => run(importDevice)}>{$t('Importar do BR⚡LN Signer')}</button>
        <label class="btn-secondary file">{$t('Importar configuração pública')}<input type="file" accept="application/json,.json" disabled={busy || !!syncController || !!proposal} on:change={event => run(() => importConfig(event))} /></label>
        <button class="btn-secondary" disabled={busy || !account} on:click={() => account && download('brln-conta-publica.json',JSON.stringify(publicAccount(account),null,2))}>{$t('Exportar configuração')}</button>
      </div>
    </section>
    <section class="section-card card">
      <p class="eyebrow">{$t('Consultas')}</p><h3>{$t(sourceLabel)}</h3>
      {#if source === 'club'}<p class="muted">{$t('O LightningOS consulta o servidor público electrum.br-ln.com:50001 pela internet, por TCP sem TLS: o servidor e intermediários podem observar as consultas. As chaves continuam no Signer. A fonte é escolhida na loja do LightningOS, sem fallback automático.')}</p>
      {:else}<p class="muted">{$t('As consultas usam o Electrum do seu node. A fonte é escolhida na loja do LightningOS, sem fallback automático.')}</p>{/if}
      <p class="muted">{$t('Node · {height} · Bitcoin mainnet · BIP84', { height: height === null ? $t('indisponível') : $t('bloco {height}', { height: $num(height) }) })}</p>
    </section>
    <section class="section-card card">
      <p class="eyebrow">{$t('Firmware')}</p><h3>{$t('Reinstalar ou instalar em outro Signer')}</h3>
      <p class="muted">{$t('Use o passo 1 da configuração. A instalação não apaga a memória de dados; não use em um Signer com carteira que precise preservar sem ter o backup.')}</p>
      <div class="actions"><button class="btn-secondary" on:click={() => { view = 'setup'; step = 1 }}>{$t('Abrir instalação')}</button></div>
    </section>
    <section class="section-card card warnbox">
      <p class="eyebrow">{$t('Piloto experimental')}</p><h3>{$t('Use apenas valores pequenos')}</h3>
      <p class="muted">{$t('Protótipo sem auditoria independente. USB não é air gap. Este app não controla o saldo nem os canais do LND. O protótipo usa ESP32 da Espressif; o backup BIP39 é independente deste Signer e do LightningOS.')}</p>
    </section>
  </div>
  {/if}
</main>

<style>
  :global(*){box-sizing:border-box}
  :global(body){margin:0;line-height:1.5}
  /* LOS component bases (Tailwind in LOS); theme.css overrides per visual theme. */
  :global(.btn-primary),:global(.btn-secondary){display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:10px 18px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s;text-decoration:none}
  :global(.btn-primary){border:1px solid rgb(var(--color-glow));background:rgb(var(--color-glow));color:rgb(var(--color-ink))}
  :global(.btn-secondary){border:1px solid rgb(255 255 255/.18);background:transparent;color:rgb(var(--color-fog))}
  :global(.btn-primary:disabled),:global(.btn-secondary:disabled){opacity:.45;cursor:default}
  :global(.input-field){display:block;font:inherit;outline:none}
  :global(button:focus-visible),:global(input:focus-visible),:global(summary:focus-visible){outline:2px solid rgb(var(--color-glow));outline-offset:2px}
  main{max-width:1440px;margin:0 auto;padding:20px 24px 48px;color:rgb(var(--color-fog))}
  .eyebrow{margin:0;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.24em;color:rgb(var(--color-brass))}
  h1{margin:6px 0 0;font-size:30px;font-weight:600;letter-spacing:-.01em}
  h2{margin:6px 0 0;font-size:22px;font-weight:600}
  h3{margin:6px 0 14px;font-size:18px;font-weight:600}
  .muted{color:rgb(var(--color-fog)/.6);font-size:14px;line-height:1.6;max-width:72ch}
  .mono{font-family:ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}
  .hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:center;border:1px solid rgb(var(--color-brass)/.2);border-radius:28px;padding:26px 28px;background:radial-gradient(circle at 10% 0%,rgb(var(--color-brass)/.16),transparent 36%),radial-gradient(circle at 92% 20%,rgb(var(--color-glow)/.1),transparent 40%),rgb(var(--color-slate)/.8);box-shadow:var(--shadow-panel)}
  .hero-main{display:flex;gap:20px;align-items:center}
  .hero-main img{width:84px;height:84px;object-fit:contain;padding:10px;border-radius:22px;background:#08111f;box-shadow:0 0 40px rgb(var(--color-brass)/.18);flex:none}
  .lead{margin:8px 0 0;color:rgb(var(--color-fog)/.65);font-size:14px;max-width:70ch}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .chips span{border:1px solid rgb(var(--color-glow)/.25);border-radius:999px;padding:4px 10px;font-size:11px;color:rgb(var(--color-fog)/.75)}
  .chips .warn{border-color:rgb(var(--color-brass)/.45);color:rgb(var(--color-brass))}
  .flow{display:flex;align-items:center;gap:12px}
  .flow div{border:1px solid rgb(255 255 255/.1);background:rgb(255 255 255/.035);border-radius:16px;padding:10px 16px;min-width:130px}
  .flow span,.stat span,.summary span,.output span,.value span{display:block;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.2em;color:rgb(var(--color-fog)/.4)}
  .flow strong{display:block;margin-top:4px;font-size:14px}
  .flow i{display:block;width:72px;height:1px;background:linear-gradient(90deg,rgb(var(--color-glow)/.6),rgb(var(--color-brass)))}
  .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}
  .stat{border:1px solid rgb(255 255 255/.1);border-radius:20px;padding:16px 18px;background:rgb(var(--color-slate)/.7);box-shadow:var(--shadow-panel)}
  .stat strong{display:block;margin-top:6px;font-size:20px;font-weight:600}
  .stat strong.good{color:rgb(var(--color-glow))}
  .stat strong.mid{color:rgb(var(--color-brass))}
  .stat small{display:block;margin-top:4px;font-size:12px;color:rgb(var(--color-fog)/.5)}
  .stat-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .tiny{padding:6px 12px;font-size:12px}
  .pills{display:inline-flex;gap:4px;padding:4px;border:1px solid rgb(255 255 255/.1);border-radius:16px;background:rgb(0 0 0/.15);margin-bottom:14px}
  .pills button{border:0;background:transparent;color:rgb(var(--color-fog)/.6);font:inherit;font-size:14px;font-weight:500;padding:8px 16px;border-radius:12px;cursor:pointer}
  .pills button.on{background:rgb(var(--color-glow));color:rgb(var(--color-ink))}
  .pills em{font-style:normal;margin-left:6px;font-size:11px;opacity:.7}
  .pills.small{margin:0}
  .banner{margin:0 0 14px;border:1px solid rgb(var(--color-glow)/.25);background:rgb(var(--color-glow)/.08);border-radius:16px;padding:10px 14px;font-size:14px;display:flex;gap:12px;align-items:center;justify-content:space-between}
  .banner.subtle{border-color:rgb(255 255 255/.1);background:rgb(255 255 255/.03);color:rgb(var(--color-fog)/.75)}
  .banner.failure{border-color:rgb(var(--color-ember)/.4);background:rgb(var(--color-ember)/.12)}
  .link{border:0;background:none;color:rgb(var(--color-glow));font:inherit;font-size:13px;cursor:pointer;padding:6px 0}
  .link:disabled{opacity:.4;cursor:default}
  .grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(320px,.7fr);gap:18px;align-items:start}
  .card{border-radius:24px}
  .side{position:sticky;top:12px}
  .row{display:flex;gap:12px;align-items:center}
  .between{justify-content:space-between;flex-wrap:wrap;margin-bottom:18px}
  .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
  .actions.end{justify-content:flex-end}
  .stepper{list-style:none;margin:0 0 22px;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .stepper button{width:100%;display:flex;align-items:center;gap:10px;border:1px solid rgb(255 255 255/.1);background:rgb(var(--color-ink)/.3);color:rgb(var(--color-fog)/.6);border-radius:14px;padding:10px 12px;font:inherit;font-size:13px;cursor:pointer;text-align:left}
  .stepper b{display:inline-flex;width:24px;height:24px;flex:none;align-items:center;justify-content:center;border-radius:999px;border:1px solid rgb(255 255 255/.2);font-size:12px}
  .stepper .done b{background:rgb(var(--color-glow)/.15);border-color:rgb(var(--color-glow)/.5);color:rgb(var(--color-glow))}
  .stepper .current{border-color:rgb(var(--color-brass)/.55);background:rgb(var(--color-brass)/.1);color:rgb(var(--color-fog))}
  .callout{display:flex;gap:12px;align-items:center;justify-content:space-between;border:1px solid rgb(255 255 255/.1);background:rgb(var(--color-ink)/.3);border-radius:16px;padding:12px 14px;margin-top:10px;font-size:14px}
  .callout b{display:inline-flex;width:24px;height:24px;flex:none;align-items:center;justify-content:center;border-radius:8px;background:rgb(var(--color-glow)/.15);color:rgb(var(--color-glow));font-size:12px}
  .callout span{flex:1}
  .callout.warn{border-color:rgb(var(--color-brass)/.3);background:rgb(var(--color-brass)/.08)}
  .choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
  .choice{text-align:left;border:1px solid rgb(255 255 255/.1);background:rgb(var(--color-ink)/.3);color:rgb(var(--color-fog));border-radius:18px;padding:16px;font:inherit;cursor:pointer}
  .choice:hover:not(:disabled){border-color:rgb(var(--color-brass)/.5);background:rgb(var(--color-brass)/.08)}
  .choice:disabled{opacity:.45;cursor:default}
  .choice strong{display:block;font-size:15px}
  .choice span{display:block;margin-top:6px;font-size:13px;color:rgb(var(--color-fog)/.55);line-height:1.5}
  .summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
  .summary.column{grid-template-columns:1fr}
  .summary div,.output,.value{border:1px solid rgb(255 255 255/.1);background:rgb(var(--color-ink)/.3);border-radius:16px;padding:12px 14px}
  .summary strong{display:block;margin-top:4px;font-size:15px}
  .output{margin-bottom:10px}
  .output p,.value p{margin:6px 0 0;font-size:13px}
  .value{margin-top:18px}
  .big{font-size:15px}
  .check{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-size:14px;color:rgb(var(--color-fog)/.8)}
  .check input{margin-top:3px;accent-color:rgb(var(--color-glow))}
  .checklist{list-style:none;margin:0;padding:0;display:grid;gap:8px}
  .checklist li{display:flex;gap:12px;align-items:flex-start;border:1px solid rgb(255 255 255/.08);background:rgb(var(--color-ink)/.25);border-radius:14px;padding:10px 12px}
  .checklist b{display:inline-flex;width:22px;height:22px;flex:none;align-items:center;justify-content:center;border-radius:999px;border:1px solid rgb(255 255 255/.2);font-size:11px;color:rgb(var(--color-fog)/.6)}
  .checklist .done b{background:rgb(var(--color-glow));border-color:rgb(var(--color-glow));color:rgb(var(--color-ink))}
  .checklist strong{display:block;font-size:13px}
  .checklist span{display:block;font-size:12px;color:rgb(var(--color-fog)/.5);margin-top:2px}
  .checklist.small{margin-top:16px}
  .note{margin-top:14px;border:1px dashed rgb(255 255 255/.15);border-radius:16px;padding:12px 14px;font-size:13px;text-align:center}
  .note strong{display:block}
  .note span{display:block;margin-top:4px;color:rgb(var(--color-fog)/.55)}
  .qr{display:block;width:100%;max-width:256px;height:auto;margin:6px auto 12px;background:#fff;border-radius:12px}
  .placeholder{border:1px dashed rgb(255 255 255/.15);border-radius:16px;padding:28px 14px;text-align:center;font-size:13px;color:rgb(var(--color-fog)/.55)}
  .full{width:100%;margin-top:10px}
  fieldset{border:0;padding:0;margin:18px 0 0;min-width:0}
  legend{font-size:12px;color:rgb(var(--color-fog)/.55);margin-bottom:8px}
  .coins{display:grid;gap:6px;max-height:280px;overflow:auto}
  .coin{display:flex;gap:12px;align-items:flex-start;border:1px solid rgb(255 255 255/.08);border-radius:14px;padding:10px 12px;background:rgb(var(--color-ink)/.25)}
  .coin input{margin-top:4px;accent-color:rgb(var(--color-glow))}
  .coin span{min-width:0}
  .coin small{display:block;font-size:11px;color:rgb(var(--color-fog)/.45)}
  .field{display:block;font-size:13px;color:rgb(var(--color-fog)/.7)}
  .field .input-field{margin-top:6px}
  .form{display:grid;gap:14px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .inline{display:flex;gap:8px;margin-top:6px}
  .inline .input-field{margin-top:0}
  .transactions{list-style:none;padding:0;margin:14px 0 0;display:grid;gap:8px}
  .transactions li{display:flex;gap:12px;align-items:center;justify-content:space-between;border:1px solid rgb(255 255 255/.08);border-radius:14px;padding:12px 14px;background:rgb(var(--color-ink)/.25)}
  .transactions li div{min-width:0}
  .transactions small{display:block;font-size:11px;color:rgb(var(--color-fog)/.45)}
  .empty{text-align:center;padding:40px}
  .empty .btn-primary{margin-top:14px}
  .settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .small-text{font-size:12px;color:rgb(var(--color-fog)/.6)}
  .file{position:relative;overflow:hidden}
  .file input{position:absolute;inset:0;opacity:0;cursor:pointer}
  .warnbox{border-color:rgb(var(--color-brass)/.3)}
  dialog{position:fixed;margin:0 auto;bottom:auto;max-width:520px;width:calc(100% - 32px);color:rgb(var(--color-fog));background:rgb(var(--color-slate));border:1px solid rgb(var(--color-glow)/.35);border-radius:24px;padding:24px;box-shadow:var(--shadow-panel)}
  dialog::backdrop{background:#000a}
  dialog p{color:rgb(var(--color-fog)/.75);line-height:1.6}
  @media(max-width:1100px){.grid{grid-template-columns:1fr}.side{position:static}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.hero{grid-template-columns:1fr}.flow{display:none}}
  @media(max-width:700px){main{padding:14px}.stats,.settings,.choices,.summary,.two,.stepper{grid-template-columns:1fr}.hero-main{flex-direction:column;align-items:flex-start}h1{font-size:24px}}
</style>
