# BRLN Hardwallet — experimental

Assinador Bitcoin de propósito geral para a LilyGO T-Display original, baseado no [Bowser da LNbits](https://github.com/lnbits/hardware-wallet). Firmware C/C++, interface Svelte/TypeScript e backend Go para integração com Electrum e LightningOS.

**Protótipo para laboratório, sem fundos reais.** O firmware compila, a interface e o backend têm testes automatizados, mas a revisão de segurança, a validação física e a recuperação em hardware ainda não estão concluídas.

- [Arquitetura, contrato HTTP, desenvolvimento e limites](DEVELOPMENT.md)
- [Issue da integração LOS #259](https://github.com/jvxis/brln-os-light/issues/259)
- [Proposta inicial](research/2026-10-14/proposta-bowser-los.md)
- [Pesquisa e fontes](research/2026-10-14/pesquisa.md)
- [Infográfico](research/2026-10-14/infografico-bowser-los-v1.png)
- [Documentação original do Bowser](UPSTREAM_README.md)

A seed, a senha e a passphrase são inseridas somente na placa. O navegador mantém apenas a conta pública e envia PSBTs para conferência e aprovação física. O servidor consulta o Electrum local e transmite transações assinadas; não recebe chaves privadas nem credenciais do LND. Não existe fallback automático para serviços públicos.

O app inclui **Preparar meu LilyGO**: instalação inicial pelo USB do computador,
com firmware e instalador servidos pelo próprio LOS. Use Chrome/Edge com HTTPS
confiável, selecione a T-Display original ESP32 de 4 MB ou 16 MB sem carteira, confira a
versão e autorize a gravação. Depois, use **Conectar por USB** para parear o
assinador e criar ou recuperar a carteira nos botões. Atualizar uma placa com
carteira ainda não é suportado. A gravação física está pendente de validação.

O piloto usa ESP32 da Espressif, com dependência desse fabricante. Hardware comum e código aberto facilitam reposição e inspeção; não eliminam essa dependência ou os riscos de cadeia de fornecimento. O backup BIP39 e a configuração pública permitem recuperação fora do LOS e desta placa.

Licença MIT do upstream preservada. Dependências vendorizadas mantêm suas licenças. Nunca publique seeds reais, passphrases, lançamentos privados de dados ou backups de membros.
