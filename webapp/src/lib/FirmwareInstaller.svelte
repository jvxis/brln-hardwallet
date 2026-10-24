<script lang="ts">
  import { onMount } from 'svelte'
  import { installerWasSeen, rememberInstaller } from './storage'
  import { identifyBoard, loadFirmware, resetToApplication, writeFirmware, FIRMWARE_ROOT, type FirmwareBundle, type FirmwareLoader } from './brln-firmware'
  export let busy = false
  export let connected = false
  export let hasProposal = false
  let supported = false, acknowledged = false, mode = 'new', progress = 0
  let phase: 'loading' | 'idle' | 'connecting' | 'ready' | 'writing' | 'done' | 'error' = 'loading'
  let message = 'Verificando o firmware incluído no app…'
  let bundle: FirmwareBundle | null = null
  let loader: FirmwareLoader | null = null
  let transport: { disconnect(): Promise<void> } | null = null
  let ownsPort = false, expanded = false, mounted = false
  function remember() { rememberInstaller() }
  function collapse() { if (!ownsPort) { expanded=false; remember() } }
  $: if (mounted && connected && !ownsPort) collapse()
  const warning = (event: BeforeUnloadEvent) => {
    if (ownsPort) { event.preventDefault(); event.returnValue = '' }
  }
  async function release(reset = false) {
    try { if (reset && loader) await loader.after('hard_reset') } catch { /* unplugged */ }
    try { await transport?.disconnect() } catch { /* already closed or unplugged */ }
    transport = null; loader = null; ownsPort = false; busy = false
  }
  async function prepare() {
    bundle = null; phase = 'loading'; message = 'Verificando o firmware incluído no app…'
    try { bundle = await loadFirmware(); phase = 'idle'; message = 'Arquivos locais verificados. Conecte o BR⚡LN Signer por um cabo USB de dados.' }
    catch { phase = 'error'; message = 'Não foi possível verificar o firmware. Confira sua sessão do BR⚡LN LightningOS e a versão do app; tente carregar novamente.' }
  }
  async function connect() {
    if (busy || connected || hasProposal || !bundle || !acknowledged || mode !== 'new' || !navigator.serial) return
    busy = true; phase = 'connecting'; message = 'Selecione a porta USB da T-Display. Identificando o chip…'
    let port: SerialPort | null = null
    try {
      // Keep requestPort directly in the click's user activation; no fetch/import before it.
      port = await navigator.serial.requestPort()
      ownsPort = true
      const { ESPLoader, Transport, HardReset } = await import('esptool-js')
      const serial = new Transport(port, false)
      const selected = port
      transport = serial
      loader = new ESPLoader({ transport: serial, baudrate: 115200, romBaudrate: 115200,
        debugLogging: false, enableTracing: false, terminal: { clean() {}, write() {}, writeLine() {} },
        // Boot the new firmware after writing; see resetToApplication.
        resetConstructors: { hardReset: (t) => Object.assign(new HardReset(t), { reset: () => resetToApplication(selected) }) } })
      const flash = await identifyBoard(loader)
      phase = 'ready'; message = `ESP32 com ${flash === '16MB' ? '16 MB' : '4 MB'} identificado. Confira o modelo do BR⚡LN Signer antes de confirmar a gravação.`
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'NotFoundError'
      message = cancelled ? 'Seleção cancelada. Nenhum firmware foi gravado.' : 'Não foi possível preparar este BR⚡LN Signer. Confira modelo, cabo e porta; feche outros programas que usam o USB. Veja as orientações abaixo.'
      phase = cancelled ? 'idle' : 'error'
      await release(true)
      // Import or construction can fail before Transport owns the selected port.
      try { await port?.close() } catch { /* unopened */ }
    }
  }
  async function install() {
    if (phase !== 'ready' || !loader || !bundle || !acknowledged || mode !== 'new') return
    phase = 'writing'; progress = 0; message = 'Gravando e verificando o firmware. Não retire o cabo nem feche esta página.'
    try {
      await writeFirmware(loader, bundle, value => progress = value)
      remember(); phase = 'done'; message = 'Gravação verificada. Confira BR⚡LN na tela do BR⚡LN Signer e use “Conectar por USB” abaixo. A criação ou recuperação da carteira acontece nos botões.'
    } catch {
      phase = 'error'; message = 'A instalação não foi concluída e verificada. Não crie uma carteira. Reconecte o BR⚡LN Signer e repita a preparação; não há repetição automática.'
    } finally { await release(); acknowledged = false }
  }
  async function cancel() {
    if (phase !== 'ready') return
    await release(true); phase = 'idle'; message = 'Preparação cancelada. Nenhum firmware foi gravado.'
  }
  onMount(() => {
    try { expanded=!installerWasSeen() && !connected } catch { expanded=!connected }
    mounted=true; remember()
    supported = isSecureContext && !!navigator.serial && !!crypto.subtle
    void prepare()
    window.addEventListener('beforeunload', warning)
    return () => { window.removeEventListener('beforeunload', warning); void release() }
  })
</script>

<details class="installer section-card" bind:open={expanded}>
  <summary on:click={event => { if (ownsPort) event.preventDefault() }}><strong>Preparar meu BR⚡LN Signer</strong><span>{phase === 'done' ? 'Instalação verificada' : 'Primeira instalação · USB'}</span></summary>
  <div class="installer-body">
  <button class="secondary skip" disabled={ownsPort} on:click={collapse}>Já tenho o firmware · ir para a carteira</button>
  <p>Instale o firmware pelo navegador, com o BR⚡LN Signer conectado a este computador. O BR⚡LN LightningOS fornece todos os arquivos.</p>
  <p><strong>Hardware compatível:</strong> LilyGO T-Display original · ESP32 · tela 1,14″ · dois botões · flash 4 MB ou 16 MB. A T-Display S3 não é compatível.</p>
  <label>O que você deseja fazer?
    <select bind:value={mode} disabled={busy}>
      <option value="new">Preparar um BR⚡LN Signer sem carteira</option>
      <option value="update">Atualizar um BR⚡LN Signer com carteira</option>
    </select>
  </label>
  {#if mode === 'update'}
    <p class="notice">A atualização de um BR⚡LN Signer com carteira ainda não está disponível. Não use a primeira instalação para atualizar. O procedimento de preservação e recuperação precisa ser validado no hardware.</p>
  {:else}
    {#if bundle}
      <p>Firmware <strong>{bundle.manifest.version}</strong> · 4 arquivos com SHA-256 verificado</p>
      <details><summary>Versão e verificação dos arquivos</summary>
        <p class="mono">Código-fonte: {bundle.manifest.source_commit}</p>
        <p>Os hashes conferem a integridade dos arquivos. A confiança no firmware também depende da revisão do código, do build e da imagem do app instalada no BR⚡LN LightningOS.</p>
        {#each bundle.manifest.parts as part}<p class="mono">{part.path} · {part.size} bytes<br />SHA-256: {part.sha256}</p>{/each}
        <a href={FIRMWARE_ROOT + 'SHA256SUMS'} download>Baixar lista SHA-256</a>
      </details>
    {/if}
    <label class="ack"><input type="checkbox" bind:checked={acknowledged} disabled={busy} />
      <span>Conferi que esta é a T-Display original e que não contém uma carteira que preciso preservar. Autorizo substituir seu firmware atual. O app não consegue identificar todas as carteiras existentes.</span>
    </label>
    {#if !supported}<p class="notice">Use Chrome ou Edge no computador, com HTTPS confiável e suporte a Web Serial.</p>{/if}
    {#if connected}<p class="notice">Desconecte o BR⚡LN Signer no botão abaixo antes de preparar o BR⚡LN Signer.</p>{/if}
    {#if hasProposal}<p class="notice">Encerre a proposta de transação antes de preparar um BR⚡LN Signer.</p>{/if}
    <div class="buttons">
      {#if phase === 'ready'}
        <button on:click={install}>Confirmar e instalar firmware</button>
        <button class="secondary" on:click={cancel}>Cancelar sem gravar</button>
      {:else}
        <button disabled={busy || connected || hasProposal || !supported || !bundle || !acknowledged} on:click={connect}>Selecionar BR⚡LN Signer USB</button>
        {#if !bundle && phase !== 'loading'}<button class="secondary" disabled={busy} on:click={prepare}>Carregar firmware novamente</button>{/if}
      {/if}
    </div>
    {#if phase === 'writing'}<progress max="100" value={progress} aria-label="Progresso da instalação"></progress><p>{Math.floor(progress)}% · gravação e verificação</p>{/if}
    <p class:error={phase === 'error'} role="status" aria-live="polite">{message}</p>
    <details><summary>Se o BR⚡LN Signer não conectar</summary><p>Use um cabo com dados e feche o monitor serial, Arduino IDE e outras abas conectadas ao BR⚡LN Signer. Se necessário, mantenha BOOT (GPIO0) pressionado, pressione e solte RESET e solte BOOT quando a conexão começar. Em alguns modelos, o sistema precisa do driver da ponte USB. Após cancelar ou desconectar, pressione RESET para sair do modo de gravação.</p></details>
  {/if}
  </div>
</details>

<style>
  .installer{padding:16px 22px;margin:18px 0}summary{cursor:pointer;list-style:disclosure-closed;color:rgb(var(--color-fog));font-size:17px}details[open]>summary{list-style:disclosure-open}summary>span{display:inline-block;color:rgb(var(--color-fog)/.65);font-size:12px;margin-left:14px}.installer-body{padding-top:10px}.skip{margin:8px 0}p{overflow-wrap:anywhere;color:rgb(var(--color-fog)/.8)}select{display:block;width:100%;max-width:440px;background:rgb(var(--color-ink));color:rgb(var(--color-fog));padding:12px;border:1px solid rgb(var(--color-fog)/.25);border-radius:8px;margin:8px 0 20px;font:inherit}.ack{display:flex;gap:12px;margin:20px 0;font-size:14px}.ack input{flex:none;width:18px;height:18px;margin-top:4px}.buttons{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}button{border:1px solid rgb(var(--color-glow));border-radius:8px;background:rgb(var(--color-glow));color:#08111f;padding:12px 16px;font-size:14px;font-weight:650;font-family:inherit;cursor:pointer}button.secondary{background:transparent;color:rgb(var(--color-fog));border-color:rgb(var(--color-fog)/.25)}button:disabled{opacity:.5;cursor:default}.notice,.error{border-left:3px solid rgb(var(--color-brass));padding:12px;background:rgb(var(--color-brass)/.1)}.error{border-color:rgb(var(--color-ember));background:rgb(var(--color-ember)/.12)}details:not(.installer){margin:18px 0;font-size:14px}.mono{font-family:ui-monospace,monospace;font-size:12px}a{color:rgb(var(--color-glow))}progress{width:100%;height:14px;accent-color:rgb(var(--color-glow))}button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid rgb(var(--color-glow));outline-offset:3px}
</style>
