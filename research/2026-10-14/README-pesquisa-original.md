> Registro histórico da pesquisa inicial de 14/10/2026, anterior à implementação. As afirmações sobre funcionalidades ainda não implementadas descrevem aquela etapa. Consulte o [README atual](../../README.md) e o [guia de desenvolvimento](../../DEVELOPMENT.md) para o estado vigente.
>
> `sources/` preserva os documentos públicos consultados, com URLs, datas de coleta e hashes em `manifest.json`. Cada documento mantém a autoria e os termos de sua fonte original. `local-references.json` registra somente nomes de arquivos, commits e hashes, sem copiar o conteúdo dos projetos locais.

# BRLN Hardwallet

Pesquisa para ensinar membros do BRLN Club a montar assinadores Bitcoin, gerar seus próprios segredos e recuperar suas carteiras com pouca dependência de fornecedores.

Direção atual: fork do Bowser nas três LILYGO T-Display originais já disponíveis, começando por USB e dois botões, com app na loja do LightningOS. A [proposta técnica](proposta-bowser-los.md) descreve as adaptações necessárias e o que ainda precisa de validação. A base upstream está em `upstream/bowser`, na branch local `brln/tdisplay-los`; ainda não há implementação das adaptações.

O requisito central é usar hardware de propósito geral, comprado por canais comuns, e permitir substituição por equipamentos de outros fabricantes. O estudo compara placas de desenvolvimento, cartões programáveis e computadores dedicados offline, com integração ao Bitcoin Core de cada membro e backup físico recuperável. A arquitetura proposta aproveita o Electrs local do LightningOS, com servidor do clube como alternativa explícita. Nenhum candidato foi aprovado como solução independente de fabricante; software aberto e vários revendedores, isoladamente, não demonstram essa independência.

- [Pesquisa inicial de 14 de outubro de 2026](pesquisa.md)
- [Manifesto das fontes preservadas e respectivos hashes](manifest.json)
- [Referências dos projetos locais, commits e hashes dos arquivos consultados](local-references.json)
- [Issue LOS #259: especificação do app, broker e critérios de aceite](https://github.com/jvxis/brln-os-light/issues/259)
- [Cópia local da especificação publicada](issue-los-bowser.md)
- [Infográfico da proposta](infografico-bowser-los-v1.png) — [prompts e ferramenta utilizados](infografico-prompts.json)

Esta etapa reúne pesquisa documental e leitura pontual de código. Ainda não há montagem, auditoria completa, compilação reproduzida ou validação física de um dispositivo.

Este repositório é destinado a documentação pública e testes com dados públicos descartáveis. Seeds reais, passphrases, sequências privadas de dados e backups de membros não pertencem aqui.
