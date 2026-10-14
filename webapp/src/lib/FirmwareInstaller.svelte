<script lang="ts">
  import { onMount } from 'svelte'
  import { identifyBoard, loadFirmware, writeFirmware, FIRMWARE_ROOT, type FirmwareBundle, type FirmwareLoader } from './brln-firmware'
  export let busy = false
  export let connected = false
  export let hasProposal = false
  let supported = false, acknowledged = false, mode = 'new', progress = 0
  let phase: 'loading' | 'idle' | 'connecting' | 'ready' | 'writing' | 'done' | 'error' = 'loading'
  let message = 'Verificando o firmware incluído no app…'
  let bundle: FirmwareBundle | null = null
  let loader: FirmwareLoader | null = null
  let transport: { disconnect(): Promise<void> } | null = null
  let ownsPort = false
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
    try { bundle = await loadFirmware(); phase = 'idle'; message = 'Arquivos locais verificados. Conecte a placa por um cabo USB de dados.' }
    catch { phase = 'error'; message = 'Não foi possível verificar o firmware. Confira sua sessão do LOS e a versão do app; tente carregar novamente.' }
  }
  async function connect() {
    if (busy || connected || hasProposal || !bundle || !acknowledged || mode !== 'new' || !navigator.serial) return
    busy = true; phase = 'connecting'; message = 'Selecione a porta USB da T-Display. Identificando o chip…'
    let port: SerialPort | null = null
    try {
      // Keep requestPort directly in the click's user activation; no fetch/import before it.
      port = await navigator.serial.requestPort()
      ownsPort = true
      const { ESPLoader, Transport } = await import('esptool-js')
      const serial = new Transport(port, false)
      transport = serial
      loader = new ESPLoader({ transport: serial, baudrate: 115200, romBaudrate: 115200,
        debugLogging: false, enableTracing: false, terminal: { clean() {}, write() {}, writeLine() {} } })
      const flash = await identifyBoard(loader)
      phase = 'ready'; message = `ESP32 com ${flash === '16MB' ? '16 MB' : '4 MB'} identificado. Confira o modelo da placa antes de confirmar a gravação.`
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'NotFoundError'
      message = cancelled ? 'Seleção cancelada. Nenhum firmware foi gravado.' : 'Não foi possível preparar esta placa. Confira modelo, cabo e porta; feche outros programas que usam o USB. Veja as orientações abaixo.'
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
      phase = 'done'; message = 'Gravação verificada. Confira BR⚡LN na tela da placa e use “Conectar por USB” abaixo. A criação ou recuperação da carteira acontece nos botões.'
    } catch {
      phase = 'error'; message = 'A instalação não foi concluída e verificada. Não crie uma carteira. Reconecte a placa e repita a preparação; não há repetição automática.'
    } finally { await release(); acknowledged = false }
  }
  async function cancel() {
    if (phase !== 'ready') return
    await release(true); phase = 'idle'; message = 'Preparação cancelada. Nenhum firmware foi gravado.'
  }
  onMount(() => {
    supported = isSecureContext && !!navigator.serial && !!crypto.subtle
    void prepare()
    window.addEventListener('beforeunload', warning)
    return () => { window.removeEventListener('beforeunload', warning); void release() }
  })
</script>

<section class="installer" aria-labelledby="firmware-title">
  <h2 id="firmware-title">Preparar meu LilyGO <span>INSTALAÇÃO USB</span></h2>
  <p>Instale o firmware pelo navegador, com a placa conectada a este computador. O próprio LOS fornece todos os arquivos.</p>
  <p><strong>Placa compatível:</strong> LilyGO T-Display original · ESP32 · tela 1,14″ · dois botões · flash 4 MB ou 16 MB. A T-Display S3 não é compatível.</p>
  <label>O que você deseja fazer?
    <select bind:value={mode} disabled={busy}>
      <option value="new">Preparar uma placa sem carteira</option>
      <option value="update">Atualizar uma placa com carteira</option>
    </select>
  </label>
  {#if mode === 'update'}
    <p class="notice">A atualização de uma placa com carteira ainda não está disponível. Não use a primeira instalação para atualizar. O procedimento de preservação e recuperação precisa ser validado no hardware.</p>
  {:else}
    {#if bundle}
      <p>Firmware <strong>{bundle.manifest.version}</strong> · 4 arquivos com SHA-256 verificado</p>
      <details><summary>Versão e verificação dos arquivos</summary>
        <p class="mono">Código-fonte: {bundle.manifest.source_commit}</p>
        <p>Os hashes conferem a integridade dos arquivos. A confiança no firmware também depende da revisão do código, do build e da imagem do app instalada no LOS.</p>
        {#each bundle.manifest.parts as part}<p class="mono">{part.path} · {part.size} bytes<br />SHA-256: {part.sha256}</p>{/each}
        <a href={FIRMWARE_ROOT + 'SHA256SUMS'} download>Baixar lista SHA-256</a>
      </details>
    {/if}
    <label class="ack"><input type="checkbox" bind:checked={acknowledged} disabled={busy} />
      <span>Conferi que esta é a T-Display original e que não contém uma carteira que preciso preservar. Autorizo substituir seu firmware atual. O app não consegue identificar todas as carteiras existentes.</span>
    </label>
    {#if !supported}<p class="notice">Use Chrome ou Edge no computador, com HTTPS confiável e suporte a Web Serial.</p>{/if}
    {#if connected}<p class="notice">Desconecte o assinador no botão abaixo antes de preparar a placa.</p>{/if}
    {#if hasProposal}<p class="notice">Encerre a proposta de transação antes de preparar uma placa.</p>{/if}
    <div class="buttons">
      {#if phase === 'ready'}
        <button on:click={install}>Confirmar e instalar firmware</button>
        <button class="secondary" on:click={cancel}>Cancelar sem gravar</button>
      {:else}
        <button disabled={busy || connected || hasProposal || !supported || !bundle || !acknowledged} on:click={connect}>Selecionar placa USB</button>
        {#if !bundle && phase !== 'loading'}<button class="secondary" disabled={busy} on:click={prepare}>Carregar firmware novamente</button>{/if}
      {/if}
    </div>
    {#if phase === 'writing'}<progress max="100" value={progress} aria-label="Progresso da instalação"></progress><p>{Math.floor(progress)}% · gravação e verificação</p>{/if}
    <p class:error={phase === 'error'} role="status" aria-live="polite">{message}</p>
    <details><summary>Se a placa não conectar</summary><p>Use um cabo com dados e feche o monitor serial, Arduino IDE e outras abas conectadas à placa. Se necessário, mantenha BOOT (GPIO0) pressionado, pressione e solte RESET e solte BOOT quando a conexão começar. Em algumas placas, o sistema precisa do driver da ponte USB. Após cancelar ou desconectar, pressione RESET para sair do modo de gravação.</p></details>
  {/if}
</section>

<style>
  .installer{border:1px solid #455565;border-radius:12px;background:#17212b;padding:24px;margin:28px 0}h2{font-size:24px;margin:0 0 14px}h2 span{display:inline-block;color:#f4b34b;font-size:11px;letter-spacing:1px;margin-left:10px}p{overflow-wrap:anywhere;color:#c1ccd6}select{display:block;width:100%;max-width:440px;background:#10151b;color:#e9edf2;padding:12px;border:1px solid #617384;border-radius:6px;margin:8px 0 20px;font-size:15px}.ack{display:flex;gap:12px;margin:20px 0;font-size:14px}.ack input{flex:none;width:18px;height:18px;margin-top:4px}.buttons{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}button{border:1px solid #f4b34b;border-radius:7px;background:#f4b34b;color:#10151b;padding:12px 16px;font-size:14px;font-weight:650;cursor:pointer}button.secondary{background:transparent;color:#e9edf2;border-color:#617384}button:disabled{opacity:.45;cursor:default}.notice,.error{border-left:3px solid #f4b34b;padding:12px;background:#332a1b}.error{border-color:#f18686;background:#48272b}details{margin:18px 0;font-size:14px}summary{cursor:pointer;color:#f4b34b}.mono{font-family:ui-monospace,monospace;font-size:12px}a{color:#8ed7ed}progress{width:100%;height:14px;accent-color:#f4b34b}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #66c9e8;outline-offset:3px}
</style>
