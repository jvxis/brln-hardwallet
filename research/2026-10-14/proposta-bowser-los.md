# Protótipo BRLN: Bowser na T-Display e app no LightningOS

Desenvolvimento do app LOS detalhado na [issue #259](https://github.com/jvxis/brln-os-light/issues/259), planejada para a linha 0.5.45 e condicionada aos testes de firmware e integração. A proposta usa backend Go e preserva o firmware Bowser em C/C++; portar o firmware para TinyGo não faz parte do primeiro piloto.

O usuário confirmou três LILYGO T-Display originais, ESP32, tela de 1,14 polegada e dois botões. A direção escolhida é aproveitar essas placas com um fork do Bowser e um app de acompanhamento no LOS. Notebook dedicado deixa de ser recomendação. Este documento especifica o trabalho; não declara o firmware adaptado ou validado para fundos.

Base local: `upstream/bowser`, branch `brln/tdisplay-los`, commit upstream `1a260517ea3b99f9c52c98b7cde4f7498e7ec789`. O checkout está sem mudanças no código. Não foi criado fork remoto nem publicação. A licença raiz é MIT; preservar atribuições e conferir também as licenças das dependências vendorizadas.

## O que já existe

- O perfil `wallet/boards/lilygo_tdisplay/profile.h` atende à T-Display original, com botões GPIO 0 e 35. Há suporte de firmware a módulo adicional de teclado/SD; isso não significa que a placa original tenha esses componentes. Criar perfil explícito para a placa sem acessórios, preservando o perfil upstream.
- O firmware recebe PSBT e exige revisão física de saídas e taxa em `wallet/718_cmd_sign_psbt.ino`. Ainda precisamos ensaiar a legibilidade dos endereços completos na tela de 240 × 135 e a correspondência exata entre revisão e assinatura.
- A seed pode ser exibida na tela; `wallet/719_show_seed.ino` não devolve as palavras na resposta serial normal.
- O cliente em `webapp/` é SvelteKit estático, usa Web Serial e monta PSBT no navegador. Consulta uma API compatível com Mempool; atualmente não é um cliente Electrum TCP.
- A recuperação em `wallet/717_cmd_restore.ino` recebe senha e palavras como argumentos. A senha de desbloqueio e a passphrase também passam pelo host no protocolo atual. Não basta mudar a aparência do app para afirmar que os segredos ficam exclusivamente na placa.
- A criação por dados em `wallet/723_cmd_create.ino` pressupõe teclado matricial ou touchscreen. Entrada por apenas dois botões é desenvolvimento novo. O perfil atual declara o teclado opcional disponível, por isso é necessário tratar corretamente a placa sem o módulo.

## Arquitetura proposta

```text
T-Display original ← USB / Web Serial → navegador do membro
                                              │
                                      HTTPS via Tailscale
                                              │
                                    app BRLN no LightningOS
                                              │
                                      adaptador Electrum
                                              │
                                     Electrs → Bitcoin Core
```

A placa conecta ao computador que abre a página. O navegador recebe permissão para acessar a porta serial local; o container no node não precisa de USB nem de acesso a `/dev`. O Tailscale atende à conexão computador–node. O firmware não precisa de Wi-Fi, Bluetooth, conta BRLN ou cliente Tailscale. USB é conexão de dados, portanto este primeiro protótipo não é air-gapped.

Web Serial exige navegador compatível e contexto seguro. Para acesso remoto, fornecer HTTPS confiável pelo navegador e validar `isSecureContext` e `navigator.serial`; criptografia de transporte do Tailscale, isoladamente, não substitui HTTPS. Abrir o app como página própria simplifica permissões de porta serial. Fontes: [Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API), [HTTPS no Tailscale](https://tailscale.com/docs/how-to/set-up-https-certificates).

O backend do app deve adaptar consultas de histórico/UTXOs, transações, taxas e broadcast ao Electrs. Navegadores não abrem o socket TCP Electrum diretamente. O adaptador terá métodos e destinos limitados, autenticação e limites de tamanho; não será um proxy TCP/RPC arbitrário. Acesso do container ao Electrs precisa de rota interna explícita, pois o bind atual em loopback do host não equivale ao localhost do container. O backend precisa apenas de dados públicos e transações assinadas, sem credenciais de gasto do LND.

Como referência intermediária, a API Mempool local pode permitir testar o webapp com menos alterações, quando instalada. Electrs continua o backend pretendido. Remover defaults públicos silenciosos; registrar que xpubs, endereços e consultas também são sensíveis para privacidade.

## Mudanças prioritárias do fork

1. **Operação com dois botões:** navegação, seleção por prefixo da lista BIP39, confirmação/correção de palavras e backup, entrada de dados 1–6 e credenciais locais. Definir gestos consistentes e testar ergonomia antes de fixar a interface. Não prometer recuperação rápida com essa tela.
2. **Segredos locais:** geração, restauração e eventual passphrase no aparelho. Substituir os comandos que aceitam seed/passphrase pelo host por operações locais. A restrição deve existir no firmware, inclusive nos transportes USB e SD, além da remoção dos formulários web. Distinguir senha que cifra o armazenamento de passphrase BIP39.
3. **Conferência de gastos:** destinatários completos, valores, taxa e troco reconhecido, com confirmação física. Testar PSBT malformada, troco falso, taxa enganosa, múltiplas saídas e inputs e modos de assinatura não permitidos.
4. **Inicialização e armazenamento:** avaliar persistência cifrada versus modo temporário. A preferência de uso ainda não está fechada: reintroduzir a seed a cada sessão com dois botões tem custo operacional. ESP32 sem secure element não permite prometer resistência física igual à de outros dispositivos. Verificar limpeza de memória, caminhos de debug e processo de atualização.
5. **Entropia:** preservar os requisitos do RNG. O upstream usa `bootloader_random_enable()`/`disable()` em `wallet/400_helpers.ino`; retirar suporte de rádio não autoriza substituir isso por chamadas aleatórias indiscriminadas. Vetores públicos e testes estatísticos não provam a qualidade de uma seed real.
6. **App LOS:** interface em português, backup da configuração pública, revisão de permissões e integração com Electrs. Manter código criptográfico existente e acompanhar correções upstream. Firmware instalável separadamente, com artefatos versionados e verificáveis; atualização do app não deve reflashear o assinador automaticamente.

## Integração com a loja

Os padrões já existentes em `brln-os-light` incluem `internal/server/apps_brln_community.go`, `internal/appmanifest/brln_community.go`, registro em `apps_registry.go` e operações do broker. O futuro app precisará de manifesto, imagem fixada por digest, lifecycle pelo broker, autenticação HTTPS e entrada na UI. Rodar sem privilégios de container, sem socket Docker e sem volumes/segredos do LND. Manter o instalador disponível fora do LOS para não transformar o clube em dependência de recuperação.

Financiamento de canais LND por PSBT fica para uma etapa posterior. A primeira versão cobre carteira on-chain e recuperação; não mistura a seed da reserva com aezeed ou identidade Nostr.

## Ensaios com as três placas

Proposta, sem gravação realizada: uma placa para desenvolvimento, outra para restaurar o backup de teste e comparar endereços/assinaturas, e a terceira para referência upstream/regressão. Isso testa substituição do aparelho, não diversidade de fabricantes de chip. O backup BIP39 e a configuração devem ser recuperados também em outra implementação compatível, em ambiente isolado e com segredos descartáveis.

Antes de qualquer alteração funcional, executar a baseline dos testes upstream e compilar o alvo original. Depois, validar criação, recuperação, reinicialização, queda de energia, parsing serial e revisão física no hardware. Para o app, testar HTTPS/Web Serial no computador do membro e consultas reais em laboratório. O LOS atual é mainnet-only: testes regtest de gasto exigem ambiente Bitcoin separado, sem fundos de produção. Não houve compilação, teste físico, auditoria integral ou operação de node nesta etapa.
