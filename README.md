# LensClick

Site institucional e area autenticada da LensClick, executados em Cloudflare Workers. Os dados estruturados ficam no D1 e as imagens profissionais ficam no R2.

## Requisitos

- Node.js 22.13 ou superior.
- Uma conta Cloudflare apenas quando chegar o momento de publicar.

## Executar localmente

```text
npm install
npm start
```

O comando aplica as migracoes no D1 local e inicia o site em `http://127.0.0.1:4174`. D1 e R2 sao simulados pelo Wrangler e persistidos em `.wrangler/state`, sem acessar a nuvem. A porta 4174 foi escolhida porque havia outro servidor local ocupando a 4173.

## Verificacoes

```text
npm test
npm run check
```

A suite automatizada de testes cobre cadastro, hash de senha, sessao, recuperacao de senha, gerenciamento e exclusao da conta, perfil profissional publico, controles de privacidade, foto no R2, portfolio profissional, contato, newsletter, protecao de origem e scripts das paginas. Execute `npm test` para consultar o total atual.

O GitHub Actions executa essas verificações automaticamente em todo Pull Request direcionado a `main` e em cada atualização da branch principal. O preview do CI também executa smoke HTTP e Playwright em Chromium; o deploy de produção é automatizado após o merge em `main`. O fluxo de contribuicao da equipe esta documentado em `CONTRIBUTING.md`.

Com `npm start` em execucao, a verificacao HTTP completa pode ser repetida em outro terminal:

```text
npm run test:smoke
```

## Dados e seguranca

- D1 armazena usuarios, sessoes, mensagens de contato, newsletter e limites contra abuso.
- R2 armazena fotos de perfil JPG, PNG ou WebP de ate 450 KB e imagens de portfolio de ate 4 MB.
- Senhas usam PBKDF2-SHA-256 com salt individual via Web Crypto; nunca sao gravadas em texto puro.
- O navegador recebe somente um token aleatorio em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em HTTPS.
- Operacoes de escrita validam origem, formato, tamanho e frequencia.
- As consultas importantes usam indices para reduzir leituras e consumo do plano gratuito do D1.

## Estrutura principal

- `src/worker.mjs`: entrypoint, handlers, autenticacao e APIs.
- `src/router.mjs`: catalogo declarativo e despacho de rotas HTTP.
- `migrations/`: evolucao versionada do D1, incluindo autenticacao, perfis profissionais e portfolio.
- `db/schema.ts`: referencia dos nomes e da versao do esquema.
- `public/`: HTML, JavaScript e demais arquivos publicos.
- `DESIGN_SYSTEM.md`: tokens, componentes e regras visuais compartilhadas.
- `wrangler.jsonc`: assets e bindings `DB` e `PROFILE_IMAGES`.
- `test/`: fluxo critico e validacao dos scripts da interface.

## Ambiente publicado

O ambiente oficial esta disponivel em:

```text
https://lensclick.renato-aparecido-business.workers.dev
```

O `wrangler.jsonc` ja referencia o D1 remoto `lensclick-db` e o bucket privado `lensclick-profile-images`. O desenvolvimento local continua isolado por meio do modo local do Wrangler.

O antigo banco local em `data/lensclick.sqlite`, quando existente, foi preservado apenas como copia local. Ele nao e enviado automaticamente para o D1 e senhas antigas em `scrypt` exigem recadastro ou um fluxo controlado de redefinicao durante uma futura migracao.

## Escopo atual

- Landing page institucional.
- Cadastro e login reais.
- Recuperacao de senha ativa com token unico de 30 minutos e envio transacional pela Brevo.
- Central autenticada para editar dados, trocar a senha e gerenciar a imagem privada do perfil.
- Perfil profissional com especialidades, localizacao, disponibilidade, faixa inicial e contatos opcionais.
- Portfolio profissional com ate 12 imagens, descricoes acessiveis, legendas e ordenacao.
- Pagina publica do fotografo, publicada somente por consentimento explicito.
- Exclusao definitiva da conta e dos dados controlados por ela, protegida por senha e confirmacao textual.
- Mensagens de contato persistidas.
- Inscricoes de newsletter persistidas.
- Traducao em portugues e ingles.
- Verificacao de e-mail em modo de aviso.
- Papel administrativo protegido por `requireAdmin` e painel de moderacao.
- Exportacao dos dados do titular em JSON por `GET /api/account/export`.

O projeto ainda nao contem um dashboard de agendamentos. A tela pos-login e uma area de perfil. As Fases 5.6 e 5.7 adicionaram preview/deploy automatizados, lint e E2E em navegador real; o PR #117 corrigiu a corrida de carregamento do perfil profissional.

Os Termos de Uso e a Politica de Privacidade devem receber revisao institucional antes de uma publicacao comercial.

## Ativacao da recuperacao de senha

A funcionalidade usa a API transacional da Brevo. O ambiente oficial possui remetente confirmado, os segredos `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` configurados no Worker e a migracao `0002_password_reset.sql` aplicada ao D1 remoto. `BREVO_SENDER_NAME` e opcional e usa `LensClick` por padrao. Os valores locais de exemplo estao em `.dev.vars.example`; segredos reais nunca devem entrar no Git.

## Documentacao tecnica

O manual completo da Fase 9, com arquitetura, MER, DER, API, seguranca, testes, operacao e roteiro de apresentacao, esta em `docs/DOCUMENTACAO_TECNICA.md`.
