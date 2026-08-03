# LensClick

Site institucional e area autenticada da LensClick, executados em Cloudflare Workers. Os dados estruturados ficam no D1 e as fotos de perfil ficam no R2.

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

Os 39 testes cobrem cadastro, hash de senha, sessao, recuperacao de senha, perfil, foto no R2, contato, newsletter, logout, novo login, protecao de origem e scripts das paginas.

O GitHub Actions executa essas verificacoes automaticamente em todo Pull Request direcionado a `main` e em cada atualizacao da branch principal. O fluxo de contribuicao da equipe esta documentado em `CONTRIBUTING.md`.

Com `npm start` em execucao, a verificacao HTTP completa pode ser repetida em outro terminal:

```text
npm run test:smoke
```

## Dados e seguranca

- D1 armazena usuarios, sessoes, mensagens de contato, newsletter e limites contra abuso.
- R2 armazena somente imagens de perfil JPG, PNG ou WebP de ate 450 KB.
- Senhas usam PBKDF2-SHA-256 com salt individual via Web Crypto; nunca sao gravadas em texto puro.
- O navegador recebe somente um token aleatorio em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em HTTPS.
- Operacoes de escrita validam origem, formato, tamanho e frequencia.
- As consultas importantes usam indices para reduzir leituras e consumo do plano gratuito do D1.

## Estrutura principal

- `src/worker.mjs`: Worker, autenticacao e APIs.
- `migrations/0001_initial.sql`: migracao versionada do D1.
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
- Recuperacao de senha com token unico de 30 minutos, pronta para ativacao apos configurar o remetente de e-mail.
- Perfil autenticado com imagem privada.
- Mensagens de contato persistidas.
- Inscricoes de newsletter persistidas.
- Traducao em portugues e ingles.

O projeto ainda nao contem um dashboard de agendamentos. A tela pos-login e uma area de perfil, conforme o escopo aprovado para a Fase 1.

Os Termos de Uso e a Politica de Privacidade devem receber revisao institucional antes de uma publicacao comercial.

## Ativacao da recuperacao de senha

A funcionalidade usa a API transacional da Brevo. Antes de publica-la, confirme um remetente no provedor, configure `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` como segredos do Worker e aplique a migracao `0002_password_reset.sql` no D1 remoto. `BREVO_SENDER_NAME` e opcional e usa `LensClick` por padrao. Os valores locais de exemplo estao em `.dev.vars.example`; segredos reais nunca devem entrar no Git.

## Documentacao tecnica

O manual completo da Fase 9, com arquitetura, MER, DER, API, seguranca, testes, operacao e roteiro de apresentacao, esta em `docs/DOCUMENTACAO_TECNICA.md`.
