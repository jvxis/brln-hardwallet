# BRLN Hardwallet — piloto experimental

Firmware C/C++ para a LilyGO T-Display original (ESP32, 1,14 polegada, dois botões),
frontend Svelte/TypeScript e adaptador Electrum em Go. Base upstream:
`lnbits/hardware-wallet@1a260517ea3b99f9c52c98b7cde4f7498e7ec789` (MIT).

**Não usar com fundos reais.** Compilação e testes de software não comprovam
segurança física, qualidade da entropia, proteção contra extração de flash,
resistência do protocolo USB ou recuperação operacional. A validação nas três
placas do clube e a revisão independente são bloqueadores da promoção.

## Contrato do piloto

- Perfil `brln_tdisplay`; botões GPIO 0/35, sem câmera, teclado ou microSD.
- Seed, senha e passphrase entram pelos controles físicos. O firmware recusa
  `/password`, `/restore`, `/create`, `/wipe`, `/seed` vindos do protocolo legado.
- `/capabilities`: `brln-1 mainnet bip84 local-secrets physical-review`.
- Comandos locais sem argumentos: `/brln-create`, `/brln-restore`,
  `/brln-unlock`, `/brln-backup`. Aprovação física; nenhum segredo na resposta.
- Conta do app: BIP84 `m/84'/0'/0'`, mainnet, xpub pública, fingerprint,
  índices de recebimento/troco. Não usa a seed do LND.
- Criação: 24 palavras; RNG da placa ou SHA256 de 100 lançamentos de dado justo.
  Recuperação: 12/24 palavras BIP39 inglesas. Passphrase ASCII opcional ao
  desbloquear; sua perda ou erro abre outra carteira. Entrada Unicode ainda não
  suportada. Senha local 12–32 caracteres; não é a passphrase BIP39.
- O armazenamento criptografado do upstream permanece experimental. Não há
  promessa de proteção contra acesso físico ou eliminação completa de cópias
  em RAM. Não grava seed no servidor, navegador ou cartão.
- App: descoberta com gap 20, até 500 índices por ramo; até 20 UTXOs confirmados
  por pagamento, um destinatário, troco próprio. Sem RBF/CPFP ou funding LND no MVP.
- PSBT é construída no navegador. Conferência física, verificação da assinatura
  e transmissão são etapas distintas. Timeout de transmissão exige consulta do txid.

## Backend

Processo não-root, porta interna 8080, filesystem somente leitura. Sem volumes
de Bitcoin/LND, socket Docker ou dispositivos USB. Não há banco de carteiras.
`BRLN_ELECTRUM_ADDR=electrs:50001`, `BRLN_AUTH_TOKEN_FILE=/run/auth/proxy_token`.
Nenhum endereço de servidor é aceito pela API; não há fallback público.

A integração está na [PR LOS #260](https://github.com/jvxis/brln-os-light/pull/260),
com destino a `agent/0.5.45-release`. A loja oferece duas escolhas explícitas:
Electrs local (`BRLN_ELECTRUM_SOURCE=local`, transporte `tcp` na rede Docker)
ou Electrs do clube (`BRLN_ELECTRUM_SOURCE=club`, transporte `tailscale`).
No segundo caso, o backend só aceita destinos IPv4 no intervalo Tailscale
`100.64.0.0/10`; não tenta o endpoint TCP público se a conexão privada falhar.
O servidor do clube pode associar as consultas de endereços dessa carteira.

O HTTPS da interface usa a CA local do LOS e uma chave própria do app. Todas
as rotas passam pela autenticação da sessão LOS. O usuário abre o LOS e o app
pelo mesmo hostname/IP da tailnet, confia na CA e conecta a placa ao computador
do navegador. A imagem não recebe a chave da CA, credenciais LND ou USB do node.
O ciclo completo de instalação, troca de fonte, certificados e autenticação
ainda precisa de validação em runtime; a PR permanece em rascunho.

`GET /healthz` é apenas liveness. Demais rotas exigem token privado injetado pelo
proxy após autenticação LOS. POST também exige Origin HTTPS igual ao Host e
`X-BRLN-Request: 1`; sem CORS. O token nunca é entregue ao navegador.

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/api/v1/status` | versão, rede, altura via Electrum |
| GET | `/api/v1/fees` | estimativa em sat/vB |
| GET | `/api/v1/script/{scripthash}` | histórico, saldo, UTXOs |
| GET | `/api/v1/transaction/{txid}` | transação bruta |
| POST | `/api/v1/broadcast` | `{ "hex": "..." }`, devolve txid |

Todas as conexões Electrum verificam o genesis mainnet. Limites de resposta,
concorrência e tempo são fechados. Erros não refletem argumentos ou diagnósticos
do servidor Electrum. Não há RPC genérico, seed import, backup remoto ou logs de payload.

## Verificação e distribuição

### Instalador USB integrado

`FirmwareInstaller.svelte` usa `esptool-js@0.7.0` (Apache-2.0) empacotado pelo
Vite, incluindo os stubs; não usa CDN, iframe ou site externo. A CSP continua
restrita à mesma origem. Nenhum endpoint privilegiado novo é necessário: USB
pertence ao computador do navegador, não ao container nem ao node. O broker
continua gerenciando exclusivamente a instalação/ciclo de vida do app.

O workflow compila `brln_tdisplay` antes da imagem OCI e inclui o pacote daquele
mesmo commit em `/firmware/brln-tdisplay/`. Arquivos e manifesto são protegidos
pela sessão LOS, como o restante da interface. O Docker build falha sem o pacote.
Para construir a imagem localmente, após compilar o firmware:

```sh
python3 tools/package_brln_firmware.py --build build/brln_tdisplay \
  --boot-app0 "$HOME/.arduino15/packages/esp32/hardware/esp32/2.0.17/tools/partitions/boot_app0.bin" \
  --output webapp/static/firmware/brln-tdisplay \
  --commit "$(git rev-parse HEAD)" --version 0.1.0-brln
```

O empacotador verifica o digest embutido da aplicação, layout de partições,
tamanhos e commit; o navegador verifica SHA-256 de todos os arquivos antes da
gravação. O chip deve ser ESP32 original com flash 4 MB. A identificação carrega
somente o stub em RAM. Uma segunda ação explícita autoriza gravar bootloader
`0x1000`, partições `0x8000`, boot_app0 `0xe000` e aplicação `0x10000`.
Não há `eraseAll`, escrita em NVS/SPIFFS, alteração de eFuses ou tentativa
automática após falha. O MD5 calculado pelo stub confere as regiões gravadas
antes de reiniciar; é uma verificação de transporte, não uma assinatura.

SHA-256 e HTTPS não substituem revisão do firmware, proveniência do build ou
confiança na imagem pinada pelo LOS. O instalador não verifica por USB o modelo
da tela nem identifica todas as carteiras existentes: o membro confirma o modelo
e que a placa não contém uma carteira a preservar. A opção de atualização fica
bloqueada; não prometer preservação de seed porque não há eraseAll.

Conexão do assinador e gravação têm exclusão mútua; proposta de transação ativa
bloqueia o instalador. Não há upload de firmware arbitrário, URL customizada,
leitura de seed ou backup de flash. Uma falha de gravação nunca libera uma
mensagem de sucesso ou repetição automática. O browser tenta liberar a porta
também em cancelamento/erro; uma falha pode exigir reconectar o cabo.

Faltam testes físicos: auto-reset/BOOT, gravação, readback, boot BR⚡LN, queda de
USB, nova tentativa e posterior pareamento/criação/recuperação. Use somente
placas de laboratório sem carteira ou fundos reais. Referência da biblioteca:
https://github.com/espressif/esptool-js/tree/v0.7.0

### Checks

- `cd backend && go test ./... && go vet ./...`
- `cd webapp && npm ci && npm test && npm run check && npm run build`
- `bash tools/build_firmware.sh brln_tdisplay` com Arduino CLI 1.5.1,
  esp32:esp32 2.0.17 e bibliotecas vendorizadas.
- Workflow `brln-experimental.yml`: testes, firmware e imagem OCI amd64/arm64.
  Artefatos são experimentais e identificados pelo commit; nenhuma gravação
  automática ou update de node é executado pelo workflow.
- A integração LOS é desenvolvida em PR draft contra `agent/0.5.45-release`.
  Não confundir alvo de desenvolvimento com aprovação de release.

## Validação que exige hardware/laboratório

1. Entrada, cancelamento, timeout, debounce e exibição legível nos dois botões.
2. Recusa de comandos legados, pareamento e desconexão em cada etapa sensível.
3. Criação, backup, recuperação em outra placa e comparação de fingerprint,
   primeiros endereços e conta em coordenador independente.
4. PSBT conhecida: destino completo, todos os outputs, troco, valores e taxa;
   rejeição física e host que altera a proposta; sem fundos reais.
5. Browser real com HTTPS confiável via Tailscale, sessão expirada e CSRF.
6. Instalar/parar/iniciar/remover/reinstalar app e Electrs em Linux descartável;
   conferir permissões, ausência de portas públicas, broker e regressões LOS.

O infográfico e a pesquisa inicial estão em `research/2026-10-14/`.
