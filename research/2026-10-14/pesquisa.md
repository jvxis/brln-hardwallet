# Pesquisa de assinadores Bitcoin e backups para o BRLN Club

Consulta em 14 de outubro de 2026, complementada com o contexto informado pelo usuário: a maioria dos membros já opera um Bitcoin full node local e LND. Escopo: autocustódia de Bitcoin on-chain para pessoas físicas, com foco em poupança e uso ocasional, aproveitando essa infraestrutura. Carteiras Lightning e seus backups exigem procedimento próprio.

**Conclusão preliminar revisada:** o requisito determinante é hardware de propósito geral, com aplicações diversas, adquirido por canais comuns e substituível por soluções de outros fabricantes. Ainda não foi demonstrado que um dos candidatos, isoladamente, satisfaça esse requisito. A seleção passa a avaliar caminhos completos de substituição entre plataformas, mantendo backup aberto e integração ao node próprio. Cartões continuam em estudo, sem prioridade presumida sobre placas. Isso é uma direção de projeto, ainda não uma homologação para custodiar valores.

O artigo local `brln-investiga/outputs/hardware-wallets-2026-10-13/artigo-substack.md`, versão 1.1, fundamenta a separação entre geração de segredos, distribuição de aparelhos, ataques físicos e phishing. Esta pesquisa não reabre a apuração dos incidentes nem transforma declarações das fabricantes em perícia independente.

**Recomendação para o primeiro piloto**

O piloto passa a usar as três LILYGO T-Display originais (ESP32, tela de 1,14 polegada e dois botões) que o usuário já possui, com fork do Bowser e futuro app na loja do LightningOS. A [proposta técnica](proposta-bowser-los.md) fixa a base upstream, o fluxo USB/Web Serial inicial e as mudanças necessárias para geração/recuperação no aparelho e conexão ao Electrs. O notebook exclusivo foi descartado pelo usuário por ser desproporcional ao objetivo de simplicidade e tamanho.

O perfil upstream já suporta a T-Display; os dois botões ainda precisam de fluxos locais de restauração e dados físicos. A placa original não tem slot microSD integrado. ESP32 continua sendo uma família de fabricante único; a escolha aceita pelo usuário permite avançar no protótipo, mantendo explícita essa dependência e exigindo backup BIP39/configuração recuperáveis fora do fork. A implementação das adaptações e a validação com hardware permanecem pendentes.

A conferência atual do catálogo da ST encontrou a [32F469IDISCOVERY classificada como NRND](https://www.st.com/en/evaluation-tools/32f469idiscovery.html), não recomendada para novos projetos. Portanto, Specter-DIY sem scanner permanece referência técnica, mas deixa de ser candidato preferencial para padronizar novas compras do clube nessa placa. NRND não significa falha de segurança nem indisponibilidade imediata. Ainda não identifiquei uma solução compacta, em cartão ou placa, que reúna todos os requisitos do usuário com substituição entre fabricantes comprovada.

**O significado prático de soberania**

A meta proposta é conseguir gerar, conferir, gastar e recuperar sem conta obrigatória, autorização de fabricante ou serviço de recuperação. Também importa conseguir substituir o aparelho, o coordenador e o fornecedor das peças.

**Requisito de hardware commodity e substituição de fabricantes**

O usuário explicitou que o cartão ou placa deve ter uso amplo fora de Bitcoin e não prender os membros a um fabricante específico. A preferência anterior por Satochip como primeiro protótipo passa a ser condicional: ainda faltam evidências de substituição entre fabricantes de cartões/chips e de um fluxo seguro de inicialização.

É necessário separar três propriedades: vários vendedores da mesma peça, fabricantes distintos de placas que usam o mesmo chip e implementações substituíveis sobre famílias de chips de fabricantes distintos. Apenas a primeira não resolve dependência industrial. Por exemplo, o ESP32 é uma família da [Espressif](https://www.espressif.com/en/products/socs/esp32), mesmo quando integra placas de diferentes marcas. JavaCard é uma plataforma com requisitos opcionais; a [documentação do Satochip](https://github.com/Toporin/SatochipApplet) exige conferir os algoritmos efetivamente implementados.

Para seleção do curso, propõe-se exigir:

- Uso geral demonstrado do hardware, com disponibilidade por canais não especializados em Bitcoin.
- Instalação de software verificável pelo usuário, sem autorização remota, conta ou certificado exclusivo de fabricante necessário ao funcionamento.
- Alternativa testada sobre hardware de outro fabricante, mesmo que execute outro software compatível.
- Recuperação completa com backup aberto: segredo, eventual passphrase e configuração da carteira. A mesma seed de teste deve permitir reconstruir os endereços e assinar em outra implementação.
- Critérios de segurança além da oferta comercial: geração do segredo, conferência do gasto, atualização e recuperação.

Trocar de plataforma não exige que um único firmware rode em todos os chips. Pode ser feito por implementações interoperáveis, com configurações e backups preservados. Entretanto, essa portabilidade não desfaz vazamento anterior de seed: um dispositivo substituível ainda pode estar adulterado. Se um segredo foi exposto, recuperá-lo em outra plataforma não o torna secreto novamente.

Uma opção concreta que merece reavaliação é Specter-DIY sem scanner. Sua [lista oficial de peças](https://github.com/cryptoadvance/specter-diy/blob/master/docs/shopping.md) descreve a placa STM32F469I-DISCO e operação por SD ou USB sem módulo QR. Isso reduz montagem, mas mantém dependência dessa família de chip na implementação atual; precisa de rota de recuperação testada em outra plataforma. A alegação da página de que a compra em lojas de eletrônica elimina ataque de fornecimento não é adotada aqui.

Outro caminho de comparação é um computador de propósito geral dedicado a assinatura offline, com tela e teclado já integrados. O [Electrum documenta essa arquitetura](https://electrum.readthedocs.io/en/latest/coldstorage.html). Ela permite estudar substituição entre computadores de fabricantes distintos, mas traz uma base de hardware, firmware e sistema operacional maior. Não é uma aprovação de qualquer PC antigo. Sua implementação no clube exigiria validar isolamento, software e formato de backup; a seed nativa do Electrum não deve ser tratada automaticamente como BIP39. O computador online do node permanece separado do assinador.

O objetivo é uma solução recuperável e substituível entre fabricantes, com riscos residuais explícitos. Componentes commodity diminuem a identificação do destino Bitcoin e ampliam possibilidades de compra; não demonstram integridade do chip, da cadeia de inicialização ou da tela.

Continuam existindo dependências: fabricação dos chips, tela e câmera; processo de inicialização; compiladores; bibliotecas criptográficas; distribuição de software; e habilidade do usuário. Componentes comuns podem diminuir a identificação do comprador como detentor de bitcoin, mas não comprovam ausência de adulteração.

O modelo de ameaças do piloto deve incluir computador infectado, transação enganosa, firmware adulterado, acesso físico ao aparelho, perda do backup e erro de recuperação. QR e cartão são canais de dados: isolamento de rede reduz exposição, mas um firmware malicioso ainda pode produzir dados ou assinaturas que vazem informações. O próprio [guia do SeedSigner](https://seedsigner.com/seedsigner-independent-custody-guide/) reconhece o risco de instalação maliciosa e o custo de acessar a seed repetidamente.

**Comparação dos caminhos**

| Caminho | Pontos relevantes | Limite para o curso | Posição proposta |
| --- | --- | --- | --- |
| SeedSigner | Pi Zero, câmera, tela e botões; operação sem persistir seed; QR | Verificação do software e segurança física ficam a cargo do usuário; relato de segurança pendente de esclarecimento | Piloto de referência |
| Krux | Placas K210; opções com câmera e touchscreen; QR ou SD; modo sem persistência | Muitos recursos e variantes; armazenamento criptografado opcional; atenção ao ciclo de vida do hardware | Piloto comparativo |
| Bowser da LNbits | ESP32, criação por dados, USB ou microSD, código disponível | Fluxo documentado de restauração transmite palavras em comando; armazenamento persistente | Laboratório didático separado |
| Jade DIY | Vários perfis ESP32 e possibilidade de assinatura temporária | Configuração de produção, rádio, debug e secure boot exigem cuidado | Alternativa técnica posterior |
| Specter-DIY | Placa de desenvolvimento com tela; SD ou USB dispensam scanner; bootloader verifica atualizações | Plataforma ST específica; instalação inicial e substituição precisam de ensaio | Candidato sem câmera |
| JavaCard com Satochip ou Keycard | Cartão programável e leitor, sem montagem de tela e câmera | Sem conferência independente no cartão; inicialização e backup precisam de análise por implementação | Novo candidato à simplicidade |

As posições são avaliações para este curso, não uma classificação universal de segurança. Fontes das arquiteturas: [SeedSigner](https://github.com/SeedSigner/seedsigner), [Krux](https://selfcustody.github.io/krux/getting-started/), [Bowser](https://github.com/lnbits/hardware-wallet), [Jade DIY](https://github.com/Blockstream/Jade/blob/master/diy/README.md) e [Specter-DIY](https://github.com/cryptoadvance/specter-diy).

**SeedSigner e Krux precisam de uma decisão por versão**

Para SeedSigner, a configuração inicial a estudar é Raspberry Pi Zero 1.3 sem Wi-Fi/Bluetooth, câmera compatível, tela Waveshare de 1,3 polegada e 240 × 240 com controles, microSD e gabinete. Cabeçalho GPIO já soldado pode simplificar a montagem, mas deve corresponder à placa sem rádio. O projeto permite remover o cartão depois da inicialização. A lista definitiva deve fixar modelo, revisão, conectores e gabinete compatível. [Documentação de montagem](https://github.com/SeedSigner/seedsigner#shopping-list).

Há um bloqueio para recomendação imediata da versão 0.8.7: a [issue 973](https://github.com/SeedSigner/seedsigner/issues/973), aberta em 2 de agosto de 2026, relata possíveis divergências entre revisão e assinatura de PSBT diante de coordenador malicioso. Na consulta, permanecia aberta; o comentário de 9 de agosto informa a adição de `SECURITY.md`. Isso comprova a existência do relato, não as vulnerabilidades alegadas. Não há resolução técnica pública demonstrada nesse fio. O piloto precisa esclarecer o alcance e a versão de correção antes de orientar uso com fundos.

Para Krux, Yahboom K210 e WonderMV são candidatos de avaliação pela integração de tela e câmera. Maix Amigo não deve ser a compra padrão: a documentação o declara descontinuado. Algumas Maix Dock incluem Wi-Fi, e há diferenças de câmera, tela e alimentação entre modelos. O guia deve selecionar uma combinação exata. [Lista oficial de peças](https://selfcustody.github.io/krux/parts/).

O [README do Krux](https://github.com/selfcustody/krux) informa que não houve auditoria formal por terceiros. A [release 26.09.0](https://github.com/selfcustody/krux/releases/tag/v26.09.0), publicada em 3 de outubro, documenta correção de overflow de 12 bytes no processamento AES-GCM usado por KEF. O mantenedor considera a exploração prática improvável e informa ausência de relatos de exploração; essa avaliação não é uma demonstração independente. A versão também atualiza Embit para 0.8.2 com verificações de PSBT reforçadas e registra preocupação com a continuidade do K210.

Uma [discussão anterior de segurança](https://github.com/selfcustody/krux/issues/843) foi encerrada pelo mantenedor com a informação de que os pontos relevantes foram tratados em 26.04.0. Os próprios participantes contestam parte das severidades do relatório assistido por IA. Não cabe apresentar a contagem do título como vulnerabilidades confirmadas.

SeedSigner e Krux usam Embit: [dependência do SeedSigner 0.8.7](https://github.com/SeedSigner/seedsigner/blob/0.8.7/requirements.txt) e [release do Krux](https://github.com/selfcustody/krux/releases/tag/v26.09.0). Compará-los oferece diversidade de hardware e interface, mas não independência total da implementação Bitcoin. Isso também importa numa futura multisig.

**O que o projeto da LNbits oferece e onde exige cuidado**

O Bowser não deve ser descartado como um simples exemplo antigo. O README atual descreve revisão física de destinos, valores e taxa, criação por dados e armazenamento criptografado autenticado. A criação com dados usa exatamente 100 lançamentos D6. Os mantenedores recomendam WebSerial para valores menores e cautela adicional para fundos significativos. [README](https://github.com/lnbits/hardware-wallet).

A reserva principal para o curso é concreta: o [comando de restauração](https://github.com/lnbits/hardware-wallet/blob/1a260517ea3b99f9c52c98b7cde4f7498e7ec789/wallet/717_cmd_restore.ino) recebe senha e palavras como texto. O [modelo de comandos SD da versão 0.8.3](https://github.com/lnbits/hardware-wallet/blob/v0.8.3/examples/sd-card/commands.in.txt) inclui `/restore` com o mnemônico e alerta que o arquivo pode conter senhas, passphrases e palavras. Preparar esse arquivo num computador conectado expõe o segredo a esse computador. Apagar o arquivo depois não desfaz uma eventual cópia e não garante eliminação física em memória flash.

Isso é um limite do fluxo documentado, não prova de roubo ou vulnerabilidade explorada. Uma cerimônia de recuperação exigiria outra máquina isolada ou um caminho de entrada local que ainda precisa ser confirmado. Para iniciantes, adiciona uma dependência que SeedSigner e Krux evitam com entrada no próprio assinador.

O hash mostrado pelo próprio dispositivo também não autentica sozinho um dispositivo comprometido. Hash, assinatura do publicador e reprodução independente da compilação respondem a perguntas diferentes. Compilar código por conta própria não comprova que o código está correto.

**Jade DIY e Specter-DIY continuam no mapa**

Jade não exige necessariamente depender do servidor da Blockstream: [Temporary Signer](https://blockstream.zendesk.com/hc/en-us/articles/9670247480089-Use-cases-for-Temporary-Signer) permite acesso sem servidor de PIN, e existe opção de servidor próprio. A disponibilidade e o funcionamento devem ser confirmados no perfil DIY escolhido.

O [guia DIY](https://github.com/Blockstream/Jade/blob/master/diy/README.md) exige atenção a configurações de debug, Bluetooth, assinatura e secure boot. Algumas mudanças de segurança são irreversíveis. Uma placa que executa Jade não herda automaticamente todas as propriedades do produto comercial.

O [Specter-DIY](https://github.com/cryptoadvance/specter-diy) documenta modo sem persistência, QR e bootloader que verifica atualizações. A instalação inicial pelo usuário é parte crítica da confiança. É um caminho relevante para aprofundamento, mas a adequação à primeira oficina depende do esforço de montagem e da obtenção das peças.

**Geração de seeds para uma oficina compreensível**

A proposta é ensinar dados físicos inseridos diretamente no assinador. Assim, a origem da aleatoriedade fica visível para o membro. Dados justos e lançamentos independentes continuam sendo pressupostos; uma distribuição aparentemente bonita não prova imprevisibilidade.

SeedSigner documenta 50 lançamentos para 12 palavras e 99 para 24; Krux documenta os mesmos mínimos. Bowser usa 100 no fluxo de 24 palavras. Cada guia deve seguir a conversão e a contagem da versão escolhida. Não se deve improvisar palavras de memória nem alterar resultados para que pareçam aleatórios. [Verificação do SeedSigner](https://github.com/SeedSigner/seedsigner/blob/dev/docs/dice_verification.md), [geração do Krux](https://selfcustody.github.io/krux/getting-started/usage/generating-a-mnemonic/).

O [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) admite 12 palavras com 128 bits de entropia e 24 com 256. Comprimento não compensa geração defeituosa. Para o piloto, proponho comparar os erros e o tempo de recuperação nos dois formatos antes de fixar o padrão didático.

Os testes de conversão devem usar exclusivamente vetores públicos descartáveis. O participante gera a seed definitiva em privado, depois de aprender o processo. Instrutor, formulário de suporte, câmera da aula e gravação de tela não devem receber dados, palavras, QR de seed ou passphrase reais.

**Backup físico sem fornecedor de segredos**

Há dois caminhos práticos a testar: placa única de inox marcada manualmente e arruelas numeradas presas por parafuso e porca. A primeira reduz peças soltas; a segunda usa ferragens comuns. O estudo de [projeto de backups de Lopp](https://blog.lopp.net/a-treatise-on-bitcoin-seed-backup-device-design/) favorece materiais resistentes, legibilidade e simplicidade. Para o protótipo, considerar inox 304 ou 316/316L de procedência verificável e ensaiar a gravação antes de escolher dimensões e ferramentas.

No [teste SAFU Ninja](https://jlopp.github.io/metal-bitcoin-storage-reviews/reviews/safu-ninja/), não houve perda dos dados, mas Lopp aponta a dificuldade de marcação e o risco de peças se soltarem. O desempenho daquela amostra não certifica qualquer arruela vendida como inox. Cada palavra deve levar seu número de posição, mesmo que as arruelas estejam presas em ordem.

Para facilitar recuperação e herança, priorizar palavras BIP39 em inglês legíveis, com posições numeradas. Os quatro primeiros caracteres identificam as palavras da lista inglesa; palavras curtas são registradas integralmente. Códigos numéricos exigem preservar a convenção de índices e a lista usada. [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).

Um SeedQR comum deve receber a mesma proteção da seed escrita: não é criptografia. A orientação proposta é manter palavras como backup durável e tratar QR como recurso opcional de operação. A existência de um QR criptografado acrescentaria senha e dependência de formato à recuperação.

Duas cópias completas em locais com riscos físicos distintos podem reduzir perda acidental, mas cada cópia aumenta os locais capazes de revelar o segredo. Metal protege contra certos acidentes; não impede leitura por quem o encontra. A escolha de locais precisa equilibrar disponibilidade e confidencialidade.

Passphrase é uma etapa adicional, com backup separado e recuperação ensaiada. Um erro de digitação deriva outra carteira válida; o aparelho não tem como adivinhar a intenção. Não deve depender apenas da memória. Para iniciantes, a primeira simulação pode ser feita sem passphrase; a decisão para fundos reais depende da proteção física possível. [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).

Não proponho divisão manual de palavras, cifra própria, XOR ou Shamir como fluxo inicial. Esses mecanismos exigem outra análise de recuperação e compatibilidade. Também não é suficiente manter apenas o aparelho, um cartão ou arquivo criptografado como backup; o [FAQ do Krux](https://selfcustody.github.io/krux/faq/) explicita essa limitação.

**Arquitetura sugerida para o piloto**

O computador executa Sparrow com informações públicas da carteira. Ele prepara a proposta de transação, transmitida por QR ou arquivo PSBT no cartão, conforme o dispositivo. O membro confere destinatário, valor, taxa e troco no aparelho. O assinador devolve a transação assinada; o computador a transmite à rede. A seed permanece no ambiente offline. [Sparrow](https://sparrowwallet.com/docs/quick-start.html), [Krux](https://selfcustody.github.io/krux/getting-started/).

Conectar Sparrow ao node próprio reduz dependência de servidores externos para consulta e transmissão. Como a maioria dos membros já possui esse node, essa integração passa a ser a arquitetura principal do curso. Xpubs e descritores públicos não autorizam gasto, porém revelam informações financeiras e precisam de cuidado com privacidade.

Considerando o LightningOS, o caminho preferencial passa a ser Sparrow → Electrs local → Bitcoin Core do membro. Sparrow também pode conectar diretamente ao Bitcoin Core, como alternativa quando não houver Electrs disponível. A conexão direta exige suporte a wallets no Core. É necessário conferir a configuração existente, autenticação e conectividade privada, sem expor RPC à internet. Nodes podados precisam de atenção ao histórico disponível para restauração. [Integração oficial](https://sparrowwallet.com/docs/connect-node.html).

**Integração com LightningOS e infraestrutura do clube**

Leitura dos checkouts locais em 14/10/2026: `brln-os-light` no commit `dfd8f3be4019ff86a4f847cc596c0b13a64629a0` e `brln-community` no commit `c550109dfdf7c2336c4d12e2478c95b328bb813b`, ambos sem alterações locais no momento da consulta. As referências e hashes estão em [local-references.json](local-references.json). Isso descreve o código consultado; não comprova a configuração ou disponibilidade de servidores em produção.

O LightningOS já possui app Electrs, com instalação pela loja, acompanhamento de indexação e conexão ao Core local. Na versão lida, a instalação exige Core local sincronizado, sem poda e com `txindex` pronto. Essa última exigência é da integração atual do LOS, não uma afirmação de requisito universal do Electrs. Fontes locais: `internal/server/apps_electrs.go`, `apps_full_index.go` e `internal/appmanifest/electrs.go`, sob `lightningos-light/`.

O fluxo proposto fica assim:

```text
Sparrow no computador do membro ── Tailscale ─────── Electrs no LightningOS
          │                                                   │
          │ proposta e assinatura                             └── Bitcoin Core local
          │ por arquivo PSBT, ou transporte do dispositivo
          ▼
Assinador separado: segredo, conferência e autorização física
          │
          └── backup físico recuperável em outra plataforma
```

A configuração pública da carteira fica no coordenador. O assinador não precisa conhecer o Electrs, acessar a internet, falar com o LND ou autenticar no clube. A interface de servidor Electrum e os formatos de carteira/transação devem permitir substituir o LOS e o coordenador. O servidor comunitário pode atender membros sem Electrs próprio ou uma contingência escolhida explicitamente; a carteira deve continuar recuperável e operável se o clube deixar de existir. A documentação do [Sparrow sobre servidores](https://sparrowwallet.com/docs/server-performance.html) descreve esse papel de consulta e transmissão pelo protocolo Electrum; seus benchmarks antigos não foram usados para dimensionamento atual.

O usuário confirmou que o clube já usa Tailscale. Ele passa a ser o transporte privado previsto entre o computador e o node. Há um ponto de conectividade a validar: o compose de `internal/appmanifest/electrs.go` publica `50001` em `127.0.0.1` do host. A tela `ui/src/pages/AppStore.tsx` apresenta um endpoint com o host e a porta, mas a presença do Tailscale não torna automaticamente esse socket acessível pelo IP da tailnet.

O primeiro caminho a ensaiar é Tailscale Serve como encaminhador TCP para `127.0.0.1:50001`, com acesso restrito aos dispositivos autorizados do membro. Isso pode dispensar um túnel SSH adicional e preservar o bind local do Electrs. A [documentação oficial do Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) confirma encaminhamento TCP de serviço local dentro da tailnet. A configuração efetiva, regras de acesso e compatibilidade com serviços Serve existentes precisam ser verificadas no piloto. Não usar Funnel neste desenho, pois ele publica o serviço na internet. Não houve configuração nem teste em node nesta pesquisa.

Tailscale é uma conveniência substituível de transporte: o assinador e o backup não dependem de conta Tailscale. O guia deve manter uma alternativa de conexão local ou túnel SSH para consultar e transmitir usando o mesmo node quando esse transporte não estiver disponível. A seed permanece no assinador, fora desse fluxo de rede.

O código `internal/server/provenance_sources.go` lista `electrum.pagcoin.org:50002:s` e `electrum.br-ln.com:50001:t` como defaults públicos da análise de proveniência de transações. Nesse formato, `s` indica TLS e `t` TCP sem TLS. Esses valores são referências de configuração, não confirmação de disponibilidade ou recomendação de conexão pública sem proteção. O mesmo recurso permite desabilitar o fallback com `PROVENANCE_PUBLIC_ELECTRUM=disabled`. Essa cadeia interna de análise não configura automaticamente o Sparrow. Para a carteira fria, a proposta é conexão ao servidor próprio e mudança de servidor deliberada, sem fallback público silencioso. Um operador externo pode observar e correlacionar consultas; TLS protege o transporte, mas não oculta essas consultas do operador.

No checkout `brln-community`, o signer é Nostr/NIP-46. O signer web guarda a chave em formato NIP-49 e a desbloqueia em memória, conforme `web/signer/README.md`. Não encontrei ali configuração ou implementação de servidor Electrum nas buscas realizadas. As referências aos servidores públicos estão no LightningOS. O Community pode apoiar distribuição do material e suporte entre membros; seus padrões de empacotamento e integração também servem como referência futura. Sua chave de identidade e seu serviço de assinatura não devem ser reaproveitados como segredo ou assinador Bitcoin.

O curso deve manter três recuperações distintas: carteira fria (seed compatível com o formato escolhido, eventual passphrase e configuração), LND (aezeed, eventual passphrase e SCB atualizado fora do node) e identidade Nostr (backup da chave; no fluxo NIP-49, arquivo e senha). Nenhum segredo real deve circular pelo chat ou pelo suporte do clube.

Uma futura integração no LOS pode mostrar sincronização, orientar a conexão privada e ajudar a configurar um coordenador somente de observação. Isso é proposta, não funcionalidade implementada neste trabalho. A primeira prova deve usar carteira descartável, verificar recebimento e troco no assinador, assinar, recuperar em outra plataforma e repetir sem serviços BRLN. A parte LND/PSBT deve ser ensaiada em laboratório regtest separado: o LightningOS atual é mainnet-only. Nenhuma chave da reserva precisa ser importada no node.

**Sinergia com LND e escolha entre câmera e cartão**

O node online pode acompanhar a carteira fria e transmitir transações, enquanto o assinador mantém a seed de reserva offline. A carteira operacional do LND deve ter segredo independente. Um full node valida a blockchain, mas não garante que o destinatário mostrado por um computador infectado corresponde à intenção do usuário.

O LND suporta abertura de canais financiada por PSBT de uma carteira externa. Isso permite gastar um UTXO da carteira fria diretamente na abertura, evitando um depósito intermediário. É uma trilha avançada: a transação assinada deve retornar ao fluxo do LND, que conclui a negociação e publica; publicar antecipadamente pelo Sparrow ou Core pode causar perda. Há limites de tempo e requisitos dos inputs a validar por versão. O valor destinado ao canal passa à operação Lightning; não continua sob assinatura offline da hardware wallet. [Documentação de PSBT do LND](https://docs.lightning.engineering/lightning-network-tools/lnd/psbt).

O curso deve distinguir os backups: BIP39 da carteira fria e aezeed do LND, com eventual passphrase, mais o `channel.backup` atualizado e copiado para fora do node. Aezeed e BIP39 não são intercambiáveis. O SCB auxilia a recuperação por fechamento com os peers; não restaura simplesmente os canais para continuarem funcionando. [Recuperação do LND](https://github.com/lightningnetwork/lnd/blob/master/docs/recovery.md).

Para o fluxo óptico de ida e volta, o assinador precisa ler QR com câmera ou scanner; o computador também precisa de uma forma de ler o QR de retorno. No SeedSigner há montagem da câmera. Em modelos Krux como Yahboom e WonderMV ela já vem integrada, junto com tela e controles. [Peças do Krux](https://selfcustody.github.io/krux/parts/).

MicroSD dispensa câmeras para transferir a transação, mas exige slot, leitor no computador e manuseio de arquivos. Krux documenta assinatura via cartão; isso não implica que retirar fisicamente a câmera de qualquer modelo seja uma configuração suportada. A recuperação por palavras deve continuar ocorrendo no assinador, sem usar o cartão como transporte da seed. [Fluxos de assinatura](https://selfcustody.github.io/krux/getting-started/usage/setting-a-coordinator-and-signing/).

O ajuste proposto é comparar uma placa integrada com Krux, usando tanto QR quanto SD, e um candidato sem câmera que aceite entrada local de seed e PSBT por arquivo. Bowser continua condicionado à solução do fluxo de restauração documentado. USB também merece avaliação quando o objetivo principal for facilidade de montagem, explicitando que cria uma conexão de dados direta e depende da proteção implementada pelo firmware.

Para preservar simplicidade, a primeira oficina cobre carteira fria com node próprio e recuperação. A abertura de canal por assinatura externa entra depois, com teste em regtest. Automatizar PSBTs pode reduzir erros, mas não justifica criar criptografia ou firmware próprios nesta fase.

O backup da configuração deve registrar rede, tipo de endereço, conta, caminho de derivação e identificação da carteira. Quando aplicável, guardar descritor público e instruções de restauração. Em multisig, preservar a política e as chaves públicas de todos os participantes; as seeds necessárias para assinar não substituem automaticamente essas informações. [Descritores no Bitcoin Core](https://github.com/bitcoin/bitcoin/blob/master/doc/descriptors.md).

Uma futura multisig 2 de 3 pode reduzir dependência de um único assinador, mas acrescenta complexidade operacional. Deve usar seeds independentes e diversidade avaliada de hardware e software. Carregar todas as seeds em um único aparelho recria um ponto comum de comprometimento. O clube não precisa custodiar uma chave dos membros para ensinar esse modelo.

**Cartão inteligente como assinador**

Um cartão inteligente com processador criptográfico pode guardar chaves e executar assinaturas. Um microSD comum, cartão com QR impresso ou etiqueta NFC de memória apenas armazena dados; não oferece por si só esse isolamento de execução.

Satochip permite instalar um applet aberto em JavaCards compatíveis. O projeto documenta compilação e carga com GlobalPlatformPro, importação de seed BIP32 e acesso por PIN. Compatibilidade exige algoritmos específicos, memória e permissão de instalação; não basta comprar qualquer cartão NFC ou de certificado digital. [Código e requisitos](https://github.com/Toporin/SatochipApplet). Existe também uma [JavaCard em branco vendida pelo projeto](https://satochip.io/product/card-for-diy-project/), útil como referência de compatibilidade, sem constituir indicação de fornecedor único.

O arranjo a testar é cartão + leitor compatível + Sparrow conectado ao Electrs local do LightningOS ou diretamente ao Core próprio. Sparrow documenta suporte a Satochip, Keycard e Tapsigner. A ausência de tela impede conferir endereços e transações de forma independente no cartão. Um computador comprometido pode solicitar assinatura diferente da que aparenta mostrar, sem extrair a chave. [Guia de smartcards do Sparrow](https://sparrowwallet.com/docs/airgapped-wallet-smartcard.html). NFC e leitor continuam sendo conexões de dados; o fato de o cartão não ter cabo próprio não elimina a interação com o host. O node próprio melhora validação e privacidade, mas não supre essa ausência de conferência no assinador.

A geração/importação da seed merece ensaio separado: a documentação do Satochip descreve importação, portanto não se deve afirmar que a seed nunca passou pelo equipamento de inicialização. O curso precisa verificar onde a entropia nasce, onde o backup é exibido e quais segredos chegam ao host. Os primeiros testes usarão somente dados descartáveis. O backup físico e a recuperação fora do cartão continuam necessários.

Keycard é outra opção programável. Entretanto, as páginas consultadas divergem: o [guia de construção](https://docs.keycard.tech/en/developers/build) diz que a ausência de certificado em cartão DIY gera aviso sem impedir funcionamento; o [guia inicial](https://docs.keycard.tech/en/developers/getting-started) afirma que, desde o applet 4.0, é necessário certificado de identidade para o cartão responder. Essa divergência exige conferência de versão e código antes de escolher Keycard para um curso sem dependência do fornecedor. O procedimento automatizado de bloqueio também é documentado como irreversível.

Applet aberto não torna o chip nem todo o sistema JavaCard abertos. A vantagem proposta é poder instalar e manter a aplicação de assinatura em hardware compatível, com menos componentes para montar. A dependência do fabricante do chip e de sua plataforma permanece.

Satochip e Keycard permanecem hipóteses para um protótipo em cartão, condicionadas ao requisito de substituição de fabricantes. A escolha depende de compatibilidade real com Sparrow, procedência das placas, proteção das chaves administrativas, recuperação independente e aceitação consciente da ausência de tela. Não há ainda teste físico nem auditoria desses cartões.

**Critérios para transformar a pesquisa em passo a passo**

1. Identificar componentes de uso geral, fabricante efetivo do chip, fabricantes de placas e alternativas sobre outra plataforma. Só então escolher listas exatas de peças e obter preços finais no Brasil, incluindo frete, tributos, ferramentas e reposição. Ainda não há cotação validada.
2. Fixar release, commit, imagem e hashes. Verificar autenticidade da chave de assinatura por canais independentes e reproduzir a compilação quando suportado. Arquivar ferramentas e instruções de forma pública.
3. Esclarecer o relato do SeedSigner e acompanhar as correções e dependências do Krux. A versão adotada precisa ter sua justificativa registrada.
4. Montar um exemplar de cada candidato. Testar legibilidade, alimentação, leitura de QR, cartão e desligamento real. Uma opção chamada sem persistência exige verificar também configurações e recursos auxiliares.
5. Usar vetores públicos para comparar mnemônico, xpub e endereços completos de recebimento e troco. Coincidência de fingerprint isolada é insuficiente para validar toda a carteira.
6. Testar propostas inválidas e enganosas: destino alterado, taxa excessiva, troco não reconhecido e modos de assinatura inesperados. Usar dados descartáveis e regtest ou rede de testes compatível com a versão.
7. Recuperar do backup físico em outro dispositivo, reconstruir a configuração e assinar novamente. Simular perda do cartão e indisponibilidade do coordenador original.
8. Medir com iniciantes o tempo, os erros de digitação, a compreensão dos avisos e a capacidade de recuperação sem intervenção do instrutor.
9. Só então redigir o guia de uso com fundos e definir uma verificação inicial de baixo valor compatível com as taxas. O teste deve incluir gasto de retorno; ver saldo não demonstra capacidade de assinar.

O primeiro material do clube deve permitir que o membro demonstre quatro competências: gerar um segredo privado, verificar o que está assinando, preservar o backup e recuperar sem depender do clube. A montagem é uma parte desse processo.

**Estado da evidência**

Foram consultados o artigo local, documentação oficial, releases, discussões públicas e trechos de código. As três referências de software encontradas foram Bowser v0.8.3, SeedSigner 0.8.7 e Krux v26.09.0; isso registra a consulta, não recomenda automaticamente sua instalação. Não houve operação com fundos, teste de hardware, reprodução de exploit, auditoria integral ou comprovação local de builds reproduzíveis.

O [manifesto](manifest.json) registra URLs, instante de coleta e SHA-256 das cópias de fontes públicas, incluindo a complementação sobre Bitcoin Core e LND. Alguns documentos foram fixados em commit; páginas, comentários e referências em branches podem mudar. Os hashes permitem conferir estas cópias, mas não autenticam por si mesmos o conteúdo remoto.
