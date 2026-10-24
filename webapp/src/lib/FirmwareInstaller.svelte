<script lang="ts">
  import { onMount } from 'svelte'
  import { rememberInstaller } from './storage'
  import { identifyBoard, loadFirmware, resetToApplication, writeFirmware, FIRMWARE_ROOT, type FirmwareBundle, type FirmwareLoader } from './brln-firmware'
  export let busy = false
  export let connected = false
  export let hasProposal = false
  /** Set once a write has been verified in this session. */
  export let done = false
  let supported = false, acknowledged = false, progress = 0
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
    try { bundle = await loadFirmware(); phase = 'idle'; message = 'Arquivos verificados. Conecte o BR⚡LN Signer a este computador por um cabo USB de dados.' }
    catch { phase = 'error'; message = 'Não foi possível verificar o firmware. Confira sua sessão do BR⚡LN LightningOS e a versão do app; tente carregar novamente.' }
  }
  async function connect() {
    if (busy || connected || hasProposal || !bundle || !acknowledged || !navigator.serial) return
    busy = true; phase = 'connecting'; message = 'Selecione a porta USB do BR⚡LN Signer. Identificando o chip…'
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
      message = cancelled ? 'Seleção cancelada. Nenhum firmware foi gravado.' : 'Não foi possível preparar este BR⚡LN Signer. Confira modelo, cabo e porta; feche outros programas que usam o USB.'
      phase = cancelled ? 'idle' : 'error'
      await release(true)
      // Import or construction can fail before Transport owns the selected port.
      try { await port?.close() } catch { /* unopened */ }
    }
  }
  async function install() {
    if (phase !== 'ready' || !loader || !bundle || !acknowledged) return
    phase = 'writing'; progress = 0; message = 'Gravando e verificando o firmware. Não retire o cabo nem feche esta página.'
    try {
      await writeFirmware(loader, bundle, value => progress = value)
      rememberInstaller(); phase = 'done'; done = true
      message = 'Gravação verificada. O BR⚡LN Signer reinicia sozinho: confirme "Preparar memória" se aparecer e confira o hash na tela.'
    } catch {
      phase = 'error'; message = 'A instalação não foi concluída e verificada. Não crie uma carteira. Reconecte o BR⚡LN Signer e repita a preparação; não há repetição automática.'
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

<div class="installer">
  <div class="facts">
    <div><span>Hardware</span><strong>LilyGO T-Display original</strong><small>ESP32 · 1,14″ · dois botões · 4 ou 16 MB</small></div>
    <div><span>Firmware</span><strong>{bundle ? bundle.manifest.version : '—'}</strong><small>{bundle ? '4 arquivos · SHA-256 conferido' : 'verificando…'}</small></div>
    <div><span>Memória de dados</span><strong>Não é apagada</strong><small>Sem carteira, o Signer pede "Preparar memória"</small></div>
  </div>
  {#if bundle}
    <details><summary>Versão e verificação dos arquivos</summary>
      <p class="mono">Código-fonte: {bundle.manifest.source_commit}</p>
      <p>Os hashes conferem a integridade dos arquivos. A confiança no firmware também depende da revisão do código, do build e da imagem do app instalada no BR⚡LN LightningOS.</p>
      {#each bundle.manifest.parts as part}<p class="mono">{part.path} · {part.size} bytes<br />SHA-256: {part.sha256}</p>{/each}
      <a href={FIRMWARE_ROOT + 'SHA256SUMS'} download>Baixar lista SHA-256</a>
    </details>
  {/if}
  <label class="ack"><input type="checkbox" bind:checked={acknowledged} disabled={busy} />
    <span>Esta é a T-Display original e não contém uma carteira que preciso preservar. Autorizo substituir o firmware atual.</span>
  </label>
  {#if !supported}<p class="notice">Use Chrome ou Edge no computador, com HTTPS confiável e suporte a Web Serial.</p>{/if}
  {#if connected}<p class="notice">Desconecte o BR⚡LN Signer antes de instalar o firmware.</p>{/if}
  {#if hasProposal}<p class="notice">Encerre a proposta de transação antes de instalar o firmware.</p>{/if}
  <div class="actions">
    {#if phase === 'ready'}
      <button class="btn-primary" on:click={install}>Confirmar e instalar firmware</button>
      <button class="btn-secondary" on:click={cancel}>Cancelar sem gravar</button>
    {:else}
      <button class="btn-primary" disabled={busy || connected || hasProposal || !supported || !bundle || !acknowledged} on:click={connect}>Selecionar BR⚡LN Signer USB</button>
      {#if !bundle && phase !== 'loading'}<button class="btn-secondary" disabled={busy} on:click={prepare}>Carregar firmware novamente</button>{/if}
    {/if}
  </div>
  {#if phase === 'writing'}<progress max="100" value={progress} aria-label="Progresso da instalação"></progress><p>{Math.floor(progress)}% · gravação e verificação</p>{/if}
  <p class="state" class:error={phase === 'error'} class:ok={phase === 'done'} role="status" aria-live="polite">{message}</p>
  <details><summary>Se o BR⚡LN Signer não conectar</summary><p>Use um cabo com dados e feche o monitor serial, Arduino IDE e outras abas conectadas ao BR⚡LN Signer. Se necessário, mantenha BOOT (GPIO0) pressionado, pressione e solte RESET e solte BOOT quando a conexão começar. Em alguns modelos, o sistema precisa do driver da ponte USB.</p></details>
</div>

<style>
  .facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}
  .facts div{border:1px solid rgb(255 255 255/.1);background:rgb(var(--color-ink)/.35);border-radius:16px;padding:14px}
  .facts span{display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.2em;color:rgb(var(--color-fog)/.45)}
  .facts strong{display:block;margin-top:6px;font-size:15px}
  .facts small{display:block;margin-top:4px;font-size:12px;color:rgb(var(--color-fog)/.55)}
  p{overflow-wrap:anywhere;color:rgb(var(--color-fog)/.75);font-size:14px;line-height:1.6}
  .ack{display:flex;gap:12px;margin:18px 0;font-size:14px;line-height:1.5;border:1px solid rgb(255 255 255/.1);background:rgb(var(--color-ink)/.35);border-radius:16px;padding:14px}
  .ack input{flex:none;width:18px;height:18px;margin-top:2px;accent-color:rgb(var(--color-glow))}
  .actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}
  .notice,.error{border-left:3px solid rgb(var(--color-brass));padding:10px 12px;background:rgb(var(--color-brass)/.1);border-radius:10px}
  .error{border-color:rgb(var(--color-ember));background:rgb(var(--color-ember)/.12)}
  .ok{border-left:3px solid rgb(var(--color-glow));padding:10px 12px;background:rgb(var(--color-glow)/.1);border-radius:10px;color:rgb(var(--color-fog))}
  details{margin:14px 0;font-size:13px}
  summary{cursor:pointer;color:rgb(var(--color-fog)/.7);font-weight:600}
  .mono{font-family:ui-monospace,monospace;font-size:12px}
  a{color:rgb(var(--color-glow))}
  progress{width:100%;height:12px;accent-color:rgb(var(--color-glow))}
  @media(max-width:700px){.facts{grid-template-columns:1fr}}
</style>
