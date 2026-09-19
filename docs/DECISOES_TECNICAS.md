# LensClick — Decisões Técnicas

**Documento de Registro de Decisões Arquiteturais (ADR-style)**

Este documento registra as principais decisões arquiteturais **já tomadas** no projeto LensClick. Ele descreve o raciocínio técnico por trás de cada escolha, as alternativas consideradas e as consequências — para que qualquer responsável pela manutenção daqui a 3 anos entenda não apenas *o que* foi decidido, mas *por que*.

> **Escopo:** apenas decisões existentes e em produção. Não propõe novas arquiteturas, não antecipa evoluções futuras como decisões tomadas e não altera código.
>
> **Fontes consultadas:** `docs/CONTEXTO_PROJETO.md` (seção 10 — fonte primária), `docs/HANDOFF.md`, `docs/ROADMAP_EVOLUCAO.md`, `docs/DOCUMENTACAO_TECNICA.md`, `README.md`, `DESIGN_SYSTEM.md`.

---

## Decisão 1 — Plataforma serverless na Cloudflare Workers

### Contexto

O LensClick precisa atender clientes e fotógrafos com uma experiência web responsiva, bilingue (PT/EN) e confiável, sem que a equipe precise administrar servidores dedicados. O produto nasce como uma plataforma premium para fotógrafos, onde custo controlado, escalabilidade automática e baixa sobrecarga operacional são requisitos desde o primeiro dia.

### Decisão tomada

A aplicação roda inteiramente na plataforma serverless da Cloudflare:

- um **Cloudflare Worker** (`src/worker.mjs`) atende tanto a API (`/api/*`) quanto os arquivos estáticos da pasta `public/` (via Workers Assets);
- os recursos D1, R2 e Assets são acessados por **bindings internos** (não por rede pública);
- o Wrangler é a ferramenta única de desenvolvimento, migração e publicação;
- o ambiente oficial é `https://lensclick.renato-aparecido-business.workers.dev`.

### Motivo da escolha

- **Sem servidor dedicado para administrar**: a equipe não provisiona, atualiza SO nem cuida de patches de infraestrutura.
- **Escala automática conforme as requisições**: o Worker replica conforme a demanda, sem configuração manual.
- **Bindings internos**: D1, R2 e Assets são acessados como referências locais no Worker, reduzindo latência e evitando exposição pública desses serviços.
- **Franquia gratuita atende com folga o uso inicial**, e o custo pode ser acompanhado pelo painel da Cloudflare.
- **Alinhamento ao produto**: uma plataforma premium para fotógrafos beneficia-se de operação enxuta e previsível, sem investimento inicial em infraestrutura.

### Alternativas consideradas

- **Servidor tradicional (VPS/EC2)**: exigiria administração contínua, patches, monitoramento de uptime e custo fixo — descartado pela sobrecarga operacional.
- **Contêineres em PaaS (ex.: Render, Railway)**: viáveis, mas adicionariam uma camada de orquestração desnecessária ao volume atual e não aproveitariam os bindings nativos da Cloudflare.
- **Outras plataformas edge (ex.: Vercel, Netlify)**: adequadas a front-end, mas o modelo de bindings D1/R2 e a integração nativa com armazenamento privado foram determinantes para escolher a Cloudflare.

### Consequências

- **Benefícios:** operação simplificada, escala automática, custo acompanhável, baixa latência na edge.
- **Limitações:** o Worker tem restrições de runtime (sem Node.js completo, Web Crypto como API criptográfica disponível), limite de CPU por requisição e dependência do ecossistema Cloudflare.
- **Pontos futuros:** se o volume crescer além da franquia gratuita, o custo passa a ser faturável e deve ser monitorado; a portabilidade para outra plataforma exigiria reescrever bindings e adaptações de runtime.

### Status

**Ativa.**

---

## Decisão 2 — Cloudflare D1 como banco de dados relacional

### Contexto

O sistema precisa persistir dados estruturados com integridade relacional: usuários, sessões, tokens de recuperação, mensagens de contato, inscrições de newsletter, contadores de rate limit, perfis profissionais e itens de portfolio. Esses dados têm relacionamentos (um usuário possui várias sessões, um perfil profissional pertence a um usuário, etc.) e exigem consultas com índices.

### Decisão tomada

Os dados estruturados ficam no **Cloudflare D1** (`lensclick-db`), um banco SQL serverless compatível com SQLite, acessado pelo Worker via binding `DB`. O esquema é definido por migrações versionadas e contém 15 tabelas:

1. `users`
2. `sessions`
3. `password_reset_tokens`
4. `contact_messages`
5. `newsletter_subscriptions`
6. `rate_limits`
7. `professional_profiles`
8. `portfolio_items`
9. `review_requests`
10. `reviews`
11. `review_audit`
12. `conversations`
13. `messages`
14. `monitor_state`
15. `monitor_minute_buckets`

As consultas usam **statements preparados com `.bind(...)`** para evitar SQL Injection, e `PRAGMA foreign_keys=ON` garante integridade referencial. As chaves estrangeiras usam `ON DELETE CASCADE` para que a exclusão de um usuário remova automaticamente sessões, tokens, perfil profissional e portfolio vinculados.

### Motivo da escolha

- **Integridade relacional**: o domínio tem relacionamentos naturais (usuário → sessões, usuário → perfil profissional → portfolio) que se beneficiam de chaves estrangeiras e CASCADE.
- **SQL familiar**: SQLite é amplamente conhecido, reduzindo curva de aprendizado e facilitando consultas.
- **Binding interno**: o D1 é acessado como referência local no Worker, sem expor o banco à internet pública.
- **Compatível com o runtime do Workers**: o D1 é o banco nativo da Cloudflare, sem necessidade de conectar a um banco externo por rede.
- **Alinhamento ao produto**: dados de conta, sessões e mensagens exigem consistência e índices — requisitos atendidos por um banco relacional.

### Alternativas consideradas

- **NoSQL (ex.: KV da Cloudflare, Firestore)**: adequado a dados simples chave-valor, mas inadequado para relacionamentos e consultas por índices compostos (busca por cidade + especialidade, por exemplo).
- **Banco externo (ex.: PostgreSQL em Neon/Supabase)**: adicionaria latência de rede, custo adicional e complexidade de conexão a partir do Worker.
- **Armazenar tudo no R2 como JSON**: inviável para consultas, índices e integridade referencial.

### Consequências

- **Benefícios:** consultas SQL com índices, integridade referencial via CASCADE, familiaridade do modelo relacional, binding interno sem exposição pública.
- **Limitações:** a janela do Time Travel depende do plano. A política de cópias adicionais e a evidência de restore isolado estão na Decisão 16. As migrations são a fonte executável do schema.
- **Pontos futuros:** conforme o volume cresce, revisar índices e health check do D1; repetir periodicamente a validação de restauração isolada prevista na Decisão 16.

### Status

**Ativa.** O `db/schema.ts` está sincronizado na versão 10 com as 15 tabelas das migrações `0001`–`0010`.

---

## Decisão 3 — Cloudflare R2 privado para imagens de perfil e portfolio

### Contexto

O sistema precisa armazenar fotos de perfil (até 450 KB, JPG/PNG/WebP) e imagens de portfolio profissional (até 12 imagens, 4 MB cada). Essas imagens são privadas por natureza: a foto de perfil só deve ser visível ao próprio usuário autenticado, e as imagens de portfolio só devem ser públicas enquanto o perfil profissional estiver publicado e a conta mantiver o papel de fotógrafo.

### Decisão tomada

As imagens ficam no **Cloudflare R2** (`lensclick-profile-images`), um bucket **privado** acessado pelo Worker via binding `PROFILE_IMAGES`. O bucket nunca expõe a chave real do objeto publicamente:

- na área da conta, o Worker confirma que o ID solicitado pertence ao usuário autenticado antes de entregar a foto;
- no perfil profissional, rotas públicas separadas liberam a foto e as imagens do portfolio **somente enquanto o perfil estiver publicado** e a conta mantiver o papel de fotógrafo;
- o D1 guarda apenas metadados, ordem e a chave privada do objeto — nunca os bytes da imagem.

### Motivo da escolha

- **Privacidade tem prioridade sobre uma URL pública simples**: uma URL pública no R2 tornaria qualquer imagem acessível a quem tivesse o link, violando o requisito de privacidade do produto.
- **Controle de acesso no Worker**: a autorização é aplicada no código, permitindo lógica de negócio (perfil publicado, papel de fotógrafo, pertencimento da imagem).
- **Separação de responsabilidades**: o D1 guarda dados estruturados; o R2 guarda bytes. Cada serviço cumpre sua finalidade.
- **Evita crescimento do banco**: imagens como Base64 no D1 aumentariam rapidamente o tamanho do banco e prejudicariam performance das consultas.

### Alternativas consideradas

- **Imagens como Base64 no D1**: rejeitado — cresce o banco rapidamente, prejudica consultas e viola a separação de responsabilidades.
- **Bucket R2 público com URL direta**: rejeitado — qualquer pessoa com o link acessaria a imagem, sem controle de autorização.
- **Serviço externo de imagens (ex.: Cloudinary, Imgix)**: adicionaria dependência externa, custo e complexidade de integração, sem aproveitar o binding nativo do R2.

### Consequências

- **Benefícios:** privacidade garantida por design, controle de acesso no Worker, separação clara entre dados e bytes, custo controlado (R2 Standard tem operações Classe A/B e armazenamento, mas `DeleteObject` é gratuito).
- **Limitações:** cada entrega de imagem exige uma requisição ao Worker + R2 (não há URL pública direta), o que pode aumentar leituras; o cache privado (`Cache-Control`) mitiga repetições.
- **Pontos futuros:** o roadmap recomenda estratégia de imagens com R2 + Image Resizing (Fase 4) e cache adicional para reduzir leituras R2.

### Status

**Ativa.**

---

## Decisão 4 — Frontend HTML, CSS e JavaScript sem framework

### Contexto

O LensClick preserva a base original do projeto, que foi construída em HTML, CSS e JavaScript puro. A equipe precisa decidir se mantém essa abordagem ou adota um framework (React, Vue, Svelte, etc.) à medida que a interface cresce.

### Decisão tomada

O frontend permanece em **HTML, CSS e JavaScript vanilla**, sem framework de UI. A organização é feita por camadas compartilhadas:

- `public/lang.js` — runtime de internacionalização (`window.i18n`, chaves `data-i18n`);
- `public/locales/` — catálogos PT-BR/EN-US com contrato de chaves equivalente;
- `public/ux.js` — comportamentos reutilizáveis (`window.LensClickUX`: `apiFetch`, `setBusy`, `showMessage`, `highlight`, `safeNextDestination`, etc.);
- `public/profile-api.js` — integração da tela de perfil;
- `public/photographer-profile.js` — renderização segura do perfil público;
- `public/refinements.css` — Design System com tokens `--lc-*`.

### Motivo da escolha

- **Preserva a base original**: o projeto já funcionava em HTML/CSS/JS; adotar um framework exigiria reescrever a interface, contrariando o princípio de evoluir sem quebrar.
- **Reduz dependências**: sem framework, não há build step obrigatório, nem árvore de dependências para manter, nem risco de obsolescência de uma biblioteca.
- **Compatível com Workers Assets**: os arquivos estáticos são servidos diretamente, sem necessidade de SSR ou hidratação.
- **Alinhamento ao produto**: a interface é relativamente estática (landing, formulários, área de conta), sem necessidade de reatividade complexa que justifique um framework.

### Alternativas consideradas

- **React/Vue/Svelte com build step**: adicionaria complexidade de toolchain, dependências e curva de aprendizado, sem benefício proporcional ao escopo atual.
- **HTMX ou similar**: viável para reatividade leve, mas a interação atual com a API já é feita via `apiFetch` em JS vanilla, sem ganho claro.
- **SSR no Worker**: possível, mas adicionaria complexidade de renderização no runtime restrito do Worker sem necessidade de produto.

### Consequências

- **Benefícios:** simplicidade, sem build step, dependências mínimas, arquivos servidos diretamente, curva de aprendizado baixa.
- **Limitações:** maior responsabilidade manual na organização de componentes e scripts; lógica de UI repetida pode surgir sem disciplina; `public/locales/` e `src/worker.mjs` são hotspots que demandam organização e manutenção cuidadosa.
- **Pontos futuros:** o roadmap recomenda separação progressiva dos scripts inline da página inicial e modularização do Worker por domínio (Fase 4), sem reescrita completa.

### Status

**Ativa.** Revisável se a complexidade da interface crescer significativamente.

---

## Decisão 5 — Mesmo domínio para frontend e API

### Contexto

A aplicação precisa servir páginas estáticas (frontend) e endpoints de API (backend) a partir do mesmo produto. A decisão sobre se frontend e API rodam no mesmo domínio ou em domínios distintos afeta CORS, cookies de sessão e complexidade de deploy.

### Decisão tomada

Frontend e API são atendidos pelo **mesmo Worker no mesmo domínio**:

- o Worker entrega os arquivos da pasta `public/` (frontend);
- o Worker atende as rotas `/api/*` (backend);
- o navegador chama rotas relativas como `/api/auth/me`, sem prefixo de domínio diferente.

### Motivo da escolha

- **Simplifica cookies de sessão**: o cookie `lensclick_session` é emitido pelo mesmo domínio que serve a página, evitando problemas de `SameSite` e `Secure` entre domínios.
- **Elimina CORS**: como frontend e API compartilham origem, não há necessidade de configurar `Access-Control-Allow-Origin` para as chamadas da API.
- **Simplifica deploy**: um único Worker publica tudo; não há necessidade de coordenar dois serviços em domínios diferentes.
- **Validação de origem trivial**: `requestOriginIsAllowed` compara a origem da requisição com a origem esperada do próprio domínio.

### Alternativas consideradas

- **API em subdomínio (ex.: `api.lensclick...`)**: exigiria configuração de CORS, cookies com `Domain` ajustado e coordenação de deploy entre dois serviços.
- **API em domínio totalmente separado**: máxima separação, mas máxima complexidade de CORS, cookies e infraestrutura — desnecessária ao escopo atual.

### Consequências

- **Benefícios:** cookies simples, sem CORS, deploy único, validação de origem direta.
- **Limitações:** frontend e API compartilham o mesmo Worker; o catálogo e o despacho já estão em `src/router.mjs`, mas os handlers ainda permanecem centralizados em `src/worker.mjs`.
- **Pontos futuros:** a Fase 4 modulariza os handlers por domínio, preservando o roteador já extraído e sem separar o deploy em múltiplos Workers.

### Status

**Ativa.**

---

## Decisão 6 — Migrações versionadas e imutáveis

### Contexto

O esquema do banco de dados evolui conforme o produto cresce: a base inicial (usuários, sessões), depois recuperação de senha, depois perfil profissional, depois portfolio. É necessário um mecanismo que permita evoluir o esquema em produção sem risco de alterar silenciosamente um banco já publicado.

### Decisão tomada

O esquema do D1 é definido por **migrações versionadas** na pasta `migrations/`:

- `0001_initial.sql` — base (usuários, sessões, contato, newsletter, rate limit);
- `0002_password_reset.sql` — tokens de recuperação;
- `0003_professional_profiles.sql` — perfil profissional;
- `0004_portfolio_items.sql` — portfolio profissional.

As migrações são **imutáveis**: uma vez publicadas em produção, nunca são editadas. Mudanças futuras criam novos arquivos com numeração sequencial. O comando `npm run db:migrate:local` (executado no `prestart`) aplica as migrações localmente; `npm run db:migrate:remote` aplica no D1 remoto.

### Motivo da escolha

- **Reprodutibilidade**: qualquer ambiente (local, preview, produção) aplica as mesmas migrações na mesma ordem, chegando ao mesmo esquema.
- **Auditoria**: o histórico de migrações documenta a evolução do esquema, permitindo rastrear quando cada tabela foi adicionada.
- **Segurança**: nunca editar um banco publicado silenciosamente evita divergência entre ambientes e perda de dados.
- **Alinhamento a boas práticas**: migrações versionadas são padrão consolidado em bancos relacionais.

### Alternativas consideradas

- **Criar tabelas manualmente em produção via `wrangler d1 execute`**: sem versionamento, sem auditoria, propenso a divergência entre ambientes.
- **ORM com sync automático de esquema**: adicionaria dependência e abstração que pode ocultar mudanças destrutivas.
- **Editar migrações já publicadas**: rejeitado — quebra reprodutibilidade e pode corromper ambientes que já aplicaram a versão original.

### Consequências

- **Benefícios:** esquema reprodutível, evolução auditável, segurança contra alterações silenciosas.
- **Limitações:** `db/schema.ts` é apenas um catálogo TypeScript; as migrações continuam sendo a fonte executável e autoritativa do esquema.
- **Pontos futuros:** atualizar `db/schema.ts` no mesmo PR que adicionar uma migração, sem modificar migrações já publicadas.

### Status

**Ativa.** O `db/schema.ts` está sincronizado na versão 10 com as 15 tabelas das migrações `0001`–`0010`.

---

## Decisão 7 — Pull Requests obrigatórios para qualquer alteração em `main`

### Contexto

O projeto evolui por contribuições que precisam ser revisadas e validadas antes de chegar à branch principal. Alterações diretas em `main` comprometem a rastreabilidade, a qualidade e a estabilidade do produto em produção.

### Decisão tomada

**Nenhuma alteração em `main` sem Pull Request.** Todo fluxo segue: `branch → PR → CI → merge → deploy`. Os PRs #2 a #17 foram todos mergeados via squash. O CI (GitHub Actions, workflow "Qualidade") executa `npm ci → npm test → npm run check` em todo PR, com concurrency, timeout de 10 minutos e status check "Testes e validação" obrigatório.

### Motivo da escolha

- **Rastreabilidade**: cada alteração em `main` tem um PR associado, com descrição, contexto e histórico de revisão.
- **Qualidade**: o CI valida testes e build antes do merge, impedindo que código quebrado chegue a `main`.
- **Estabilidade do produto em produção**: como `main` é deployada, bloquear merges sem validação protege o ambiente oficial.
- **Alinhamento a boas práticas**: PR obrigatório é padrão consolidado em projetos profissionais.

### Alternativas consideradas

- **Commits diretos em `main`**: rejeitado — sem rastreabilidade, sem validação automática, sem revisão.
- **Deploy manual via `wrangler deploy` em `main`**: rejeitado — o roadmap recomenda manter o fluxo automatizado `branch → PR → CI → merge → deploy via Wrangler/GitHub Actions`.

### Consequências

- **Benefícios:** rastreabilidade, validação automática, estabilidade de `main`.
- **Limitações:** o fluxo adiciona um passo (abrir PR) para qualquer alteração, inclusive pequenas — aceito como custo de qualidade.
- **Pontos futuros:** o roadmap recomenda ambiente de preview para PRs de alto risco e deploy automatizado via GitHub Actions.

### Status

**Ativa.** Regra inegociável, segundo o roadmap.

---

## Decisão 8 — Squash merge e proteção estrita da branch `main`

### Contexto

A branch `main` é a base de deploy e precisa manter um histórico limpo, linear e protegido contra force push e deleções acidentais. A decisão sobre a estratégia de merge e as regras de proteção afeta a legibilidade do histórico e a segurança do repositório.

### Decisão tomada

- **Squash merge**: todos os PRs são mergeados via squash, resultando em um commit por PR no histórico de `main` (ex.: PRs #2 a #17).
- **Proteção estrita de `main`**:
  - `required_linear_history` (fast-forward only) — sem merge commits;
  - `enforce_admins` true — as regras valem para administradores;
  - **sem force push** e **sem deleções** de branches protegidas;
  - **resolução de conversas** obrigatória em PRs;
  - **0 approving reviews** obrigatórios (o projeto é mantido por uma pessoa, mas o CI é obrigatório);
  - status check **"Testes e validação"** obrigatório antes do merge.

### Motivo da escolha

- **Histórico linear e limpo**: squash merge produz um commit por PR, facilitando leitura e rollback.
- **Proteção contra acidentes**: sem force push e sem deleções, o histórico não pode ser reescrito ou perdido.
- **Validação obrigatória**: o status check do CI impede merge de código que não passou nos testes.
- **Equidade**: `enforce_admins` garante que ninguém contorna as regras.

### Alternativas consideradas

- **Merge commit (sem squash)**: produz histórico ramificado e commits intermediários, dificultando leitura — rejeitado por `required_linear_history`.
- **Rebase sem squash**: mantém todos os commits do branch, poluindo o histórico com commits intermediários de trabalho.
- **Sem proteção de branch**: rejeitado — permitiria force push, deleções e merges sem CI.

### Consequências

- **Benefícios:** histórico linear e legível, proteção contra reescrita, CI obrigatório, rastreabilidade de cada PR.
- **Limitações:** squash merge perde a granularidade dos commits intermediários do branch (aceito como custo de legibilidade); 0 approving reviews significa que a revisão humana depende da disciplina do mantenedor.
- **Pontos futuros:** se a equipe crescer, definir número mínimo de approving reviews; considerar ambiente de preview para PRs de alto risco.

### Status

**Ativa.**

---

## Decisão 9 — Autenticação por sessões, PBKDF2-SHA-256 e Web Crypto

### Contexto

O sistema precisa autenticar usuários (cadastro, login, logout), proteger senhas em repouso, manter sessões persistentes por 7 dias e permitir recuperação de senha por e-mail. Tudo isso dentro do runtime restrito do Cloudflare Workers, que não oferece Node.js completo nem bibliotecas nativas de criptografia além da Web Crypto API.

### Decisão tomada

A autenticação é implementada com os seguintes componentes:

- **Hash de senha**: PBKDF2-SHA-256 com **100.000 iterações** e **salt aleatório de 16 bytes** por usuário. O formato armazenado é `pbkdf2-sha256$100000$<salt>$<hash>`. A senha original nunca é gravada.
- **Web Crypto API**: `crypto.subtle` (PBKDF2, SHA-256) e `crypto.getRandomValues` (tokens aleatórios) — APIs disponíveis no runtime do Workers.
- **Sessões**: o navegador recebe um token aleatório; o D1 armazena apenas `SHA-256(token)` (nunca o token em texto). O cookie `lensclick_session` é `HttpOnly`, `Secure` (em HTTPS), `SameSite=Lax`, com TTL de 7 dias. Cada usuário mantém no máximo cinco sessões ativas; o logout remove a sessão apresentada e expira o cookie.
- **Recuperação de senha**: tokens de uso único (`password_reset_tokens`) com expiração, enviados por e-mail via Brevo.
- **Revogação**: a troca de senha revoga todas as outras sessões do usuário, preservando apenas a sessão usada na alteração.
- **Comparação constante**: `verifyPassword` percorre todos os bytes para reduzir varição temporal.

### Motivo da escolha

- **PBKDF2 com 100.000 iterações**: é o **maior valor aceito pelo Web Crypto do Cloudflare Workers** nesta implementação. Um valor anterior de 120.000 foi rejeitado em produção e corrigido com teste de regressão.
- **Salt individual**: cada usuário tem seu próprio salt, impedindo ataques de rainbow table e garantindo que senhas iguais produzam hashes diferentes.
- **Token de sessão hasheado no banco**: mesmo se o D1 for comprometido, o atacante não obtém tokens de sessão válidos.
- **Cookie HttpOnly**: o JavaScript da página não consegue ler o cookie, mitigando roubo por XSS.
- **Web Crypto nativo**: aproveita a API criptográfica disponível no runtime, sem dependências externas.

### Alternativas consideradas

- **bcrypt/argon2**: não disponíveis nativamente no Web Crypto do Workers; exigiriam WASM ou bibliotecas externas, adicionando complexidade.
- **120.000 iterações**: rejeitado em produção pelo runtime do Workers — corrigido para 100.000.
- **JWT sem estado (stateless)**: dispensaria a tabela `sessions`, mas dificultaria revogação imediata (necessária na troca de senha) e invalidação de sessões.
- **Armazenar token de sessão em texto no banco**: rejeitado — comprometimento do banco exporia sessões ativas.

### Consequências

- **Benefícios:** senhas protegidas com salt individual, sessões revogáveis, cookie protegido contra XSS, recuperação de senha por token de uso único, runtime compatível.
- **Limitações:** não existe segundo fator de autenticação (2FA); não existe verificação de e-mail; o rate limiting é híbrido, com escudo de rajada nativo na edge e política de janela longa no D1.
- **Pontos futuros:** o roadmap recomenda revisar periodicamente a expiração e a rotação de sessões, além de considerar 2FA e verificação de e-mail.

### Status

**Ativa.** Revisável para adicionar 2FA e verificação de e-mail no futuro.

---

## Decisão 10 — Internacionalização por catálogos com `lang.js` e `window.i18n`

### Contexto

O LensClick é uma plataforma bilingue (português e inglês). A interface precisa alternar idiomas sem recarregar a página, preservar o idioma escolhido pelo usuário e manter acessibilidade. A decisão sobre como implementar i18n afeta manutenção, performance e estrutura do HTML.

### Decisão tomada

A internacionalização é implementada em **JavaScript vanilla** pelo runtime `public/lang.js` (módulo `window.i18n`) e pelos catálogos `public/locales/pt-BR.json` e `public/locales/en-US.json`:

- os elementos traduzíveis usam **chaves** como `data-i18n`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-aria` e `data-i18n-section`;
- o **português é o idioma de origem** e o HTML em português funciona como fallback progressivo;
- PT-BR e EN-US mantêm o mesmo contrato de chaves em arquivos JSON separados;
- o runtime carrega e armazena os catálogos em cache, interpola parâmetros e tenta novamente após falhas transitórias;
- a preferência de idioma fica apenas no **`localStorage`** — dados de conta nunca ficam nesse armazenamento;
- o módulo dispara `translations.updated` para outros componentes;
- a transição de idioma tem animação vertical curta, respeitando `prefers-reduced-motion`.

### Motivo da escolha

- **Sem framework**: mantém a decisão de frontend vanilla, sem adicionar dependência de biblioteca de i18n.
- **PT como origem**: o HTML já está em português e permanece utilizável se o catálogo falhar, sem duplicar páginas.
- **Preferência em localStorage**: simples, persistente e suficiente para idioma (não é dado sensível).
- **Acessibilidade**: a troca de idioma atualiza texto, placeholders, títulos e rótulos ARIA.
- **Alinhamento ao produto**: PT/EN atende ao público atual; a estrutura por chaves permite adicionar idiomas no futuro.

### Alternativas consideradas

- **Biblioteca de i18n (ex.: i18next)**: adicionaria dependência e build step, sem benefício proporcional ao escopo vanilla.
- **Dois HTMLs separados (PT e EN)**: duplicação de marcação, difícil de manter, sem troca dinâmica.
- **SSR com i18n no Worker**: adicionaria complexidade de renderização no runtime restrito.

### Consequências

- **Benefícios:** troca dinâmica sem recarga, preferência persistente, catálogos independentes, fallback progressivo, acessibilidade preservada e nenhuma dependência externa.
- **Limitações:** a tradução continua aplicada no cliente após o HTML inicial; pluralização avançada ainda exigirá evolução do helper.
- **Pontos futuros:** adicionar novos idiomas por catálogo e, quando necessário, evoluir pluralização e formatação locale-aware sem alterar o HTML.

### Status

**Ativa.** Evoluída para catálogos pelo PR #42 (Fase 2.4) e validada em produção em 28 de agosto de 2026.

---

## Decisão 11 — Design System com tokens `--lc-*` em `refinements.css`

### Contexto

A interface precisa de consistência visual: cores, tipografia, espaçamento, raios, sombras, altura de controles, foco e movimento. Sem um Design System formal, os valores se espalham pelos arquivos CSS, gerando inconsistência e dificuldade de manutenção.

### Decisão tomada

O Design System é formalizado em `public/refinements.css` com **tokens oficiais prefixados por `--lc-*`**:

- **cores**: marca em roxo `#a35bff` e azul `#5bb3ff`, superfícies escuras, texto de alto contraste;
- **espaçamento**: escala baseada em múltiplos de 4 px (1 a 16);
- **controles**: altura mínima de 48 px (acessibilidade);
- **raios, sombras e movimento**: tokens dedicados;
- **foco visível** e **transições curtas** com curva padrão;
- **redução de movimento** quando `prefers-reduced-motion` é solicitado;
- **aliases temporários** (`--accent-1`, `--text`, `--radius`, `--shadow`) mantidos para compatibilidade com código legado.

### Motivo da escolha

- **Fonte oficial única**: os tokens `--lc-*` são a referência para cores, tipografia, espaçamento e movimento, evitando valores dispersos.
- **Acessibilidade**: altura mínima de 48 px e foco visível atendem a WCAG.
- **Compatibilidade**: aliases temporários permitem migrar código legado gradualmente, sem quebrar o existente.
- **Alinhamento ao produto**: a direção visual (carvão, off-white, cinza quente, acento suave não neon) reflete o posicionamento premium e discreto do LensClick.

### Alternativas consideradas

- **CSS-in-JS ou Tailwind**: adicionaria build step e/ou dependência, contrariando a decisão de frontend vanilla.
- **Valores dispersos sem tokens**: rejeitado — gera inconsistência e dificulta manutenção.
- **Design System em JS (ex.: Style Dictionary)**: útil para multiplataforma, mas desnecessário para um projeto web vanilla.

### Consequências

- **Benefícios:** consistência visual, acessibilidade, manutenção centralizada, compatibilidade com legado via aliases.
- **Limitações:** os aliases temporários (`--accent-1`, etc.) devem ser migrados gradualmente para `--lc-*` para evitar duplicação de longo prazo.
- **Pontos futuros:** concluir a migração dos aliases para tokens `--lc-*` oficiais.

### Status

**Ativa.** Os aliases temporários são **Temporários** (devem ser migrados).

---

## Decisão 12 — Agentes especializados do Copilot

### Contexto

O projeto é mantido por uma equipe enxuta e precisa de especialização por domínio (arquitetura, frontend, backend, banco de dados, segurança, DevOps, QA, SEO, marketing, design, revisão). A decisão sobre como estruturar essa especialização afeta a consistência e a qualidade das contribuições.

### Decisão tomada

Foram criados **11 agentes especializados do Copilot** em `.github/agents/`:

1. Arquiteto de Software
2. Designer
3. Engenheiro Backend
4. Engenheiro de Banco de Dados
5. Engenheiro DevOps
6. Engenheiro de QA
7. Engenheiro Frontend
8. Especialista em Segurança
9. Especialista em SEO e Performance
10. Especialista em Marketing para Fotografia
11. Revisor de Código

Cada agente tem descrição, propósito e `argumentHint` próprios, e é invocado conforme o domínio da tarefa.

### Motivo da escolha

- **Especialização por domínio**: cada agente traz contexto e instruções específicas, melhorando a qualidade das contribuições.
- **Consistência**: os agentes formalizam padrões e responsabilidades, reduzindo variações de abordagem.
- **Alinhamento ao produto**: o LensClick tem necessidades técnicas (segurança, performance, SEO) e de produto (marketing, design) que se beneficiam de especialização.

### Alternativas consideradas

- **Um único agente genérico**: sem especialização, com qualidade variável conforme o domínio.
- **Agentes externos ao repositório**: não versionados, sem rastreabilidade.

### Consequências

- **Benefícios:** especialização, consistência, rastreabilidade (versionados no repo).
- **Limitações:** os agentes exigem manutenção (atualização de descrições e instruções conforme o produto evolui).
- **Pontos futuros:** revisar os agentes periodicamente para alinhá-los à evolução do produto.

### Status

**Ativa.**

---

## Decisão 13 — Segurança: R2 privado, validação de sessão e proteção de dados

### Contexto

O LensClick lida com dados pessoais (nome, e-mail, telefone, idade, gênero), senhas, sessões, fotos privadas e mensagens. A segurança precisa ser tratada em múltiplas camadas: armazenamento, transporte, autenticação, autorização e resposta.

### Decisão tomada

A segurança é implementada com os seguintes controles **já em produção**:

- **R2 privado**: o bucket `lensclick-profile-images` nunca expõe a chave real do objeto; a entrega de imagens passa pelo Worker, que valida pertencimento e estado de publicação.
- **Validação de sessão**: `authenticatedUser` valida o cookie e busca a sessão ativa no D1; `requestOriginIsAllowed` permite escrita apenas pela mesma origem.
- **Hash de senha**: PBKDF2-SHA-256 com salt individual (ver Decisão 9).
- **Cookie HttpOnly/Secure/SameSite=Lax**: o JavaScript da página não lê o cookie (ver Decisão 9).
- **Consultas preparadas**: SQL com `.bind(...)` para evitar SQL Injection.
- **Validação no servidor**: formato, tamanho e MIME validados no Worker, independentemente do navegador.
- **Rate limit**: tabela `rate_limits` com bucket e expiração para cadastro, login, contato e newsletter.
- **Cabecalhos de segurança**: HSTS por dois anos com `includeSubDomains` e sem `preload`; `Content-Security-Policy` sem `'unsafe-inline'` em `script-src`; `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy` sem câmera, microfone e geolocalização. O Worker cobre respostas dinâmicas e `public/_headers` cobre assets estáticos.
- **Mensagens de erro interno sem stack trace**: o cliente recebe mensagem genérica, sem detalhes sensíveis.
- **Exclusão definitiva**: a exclusão da conta remove foto, tokens, sessões e usuário em transação; mensagens de contato e newsletter não são removidas por coincidência de e-mail enquanto não há verificação de titularidade.

### Motivo da escolha

- **Defesa em profundidade**: múltiplas camadas (hash, cookie, origem, SQL preparado, validação, rate limit, cabeçalhos) reduzem a superfície de ataque.
- **Privacidade por design**: o R2 privado e a validação de pertencimento garantem que imagens só são entregues a quem tem direito.
- **Não exposição de segredos**: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` são configurados via `wrangler secret put`, nunca hardcoded no repositório.
- **Alinhamento ao produto**: uma plataforma premium para fotógrafos exige confiança e proteção de dados.

### Alternativas consideradas

- **Bucket R2 público**: rejeitado — violaria privacidade (ver Decisão 3).
- **Validação apenas no navegador**: rejeitado — o navegador é bypassable; o Worker é a barreira real.
- **Mensagens de erro com stack trace**: rejeitado — expõe detalhes internos ao atacante.

### Consequências

- **Benefícios:** defesa em profundidade, privacidade por design, segredos fora do código, cabeçalhos de segurança, rate limit básico.
- **Limitações conhecidas de segurança**:
  - não existe segundo fator de autenticacao (2FA);
  - não existe verificação de e-mail;
  - o rate limiting é híbrido: bindings nativos na edge protegem contra rajadas e o D1 mantém as políticas longas autoritativas;
  - termos e política precisam de revisão institucional antes de uso comercial;
  - papéis `client` e `photographer` são dados de perfil, ainda não autorizam áreas diferentes.
- **Pontos futuros:** o roadmap recomenda rotação periódica de segredos, auditoria trimestral e 2FA/verificação de e-mail. O `'unsafe-inline'` restante em `style-src` deve ser removido apenas após migrar os estilos inline sem regressão visual.

### Status

**Ativa.** HSTS, CSP de scripts e teto de sessões validados em produção; revisável para 2FA e verificação de e-mail.

---

## Decisão 14 — Roadmap técnico como documento vivo

### Contexto

O projeto precisa de um plano de evolução que oriente as próximas iniciativas sem comprometer a base existente. A decisão sobre como estruturar o roadmap afeta a priorização, a reversibilidade e o gate de qualidade das evoluções.

### Decisão tomada

O roadmap técnico é formalizado em `docs/ROADMAP_EVOLUCAO.md` como **documento vivo**. As 16 iniciativas originais das Fases 1 a 4 foram concluídas; a Fase 5 acrescentou oito iniciativas de consolidação e prontidão operacional:

- **Fase 1 (Fundação técnica)**: observabilidade/logs, suite de testes por rota, rate limiting nativo, índices e health check do D1. Marco de transição: extrair roteador para `src/router.mjs`.
- **Fase 2 (Melhorias de experiência)**: onboarding guiado, busca com filtros, galeria de portfolio, i18n real com catálogos.
- **Fase 3 (Crescimento)**: avaliações/reputação, SEO técnico, mensagens cliente-fotógrafo, sitemap dinâmico e robots.txt.
- **Fase 4 (Consolidação técnica)**: cache de edge, modularização do Worker por domínio, estratégia de imagens R2 + Image Resizing, alertas e SLOs.
- **Fase 5 (Consolidação e prontidão operacional)**: documentação confiável, backup e restauração, segurança transversal, autorização, portabilidade, automação de entrega, qualidade e presença digital.

**Princípios de execução:**

- **Nenhuma reescrita completa**: o monolito Workers + D1 + R2 é apropriado ao estágio; crescer modularmente, não trocar de stack.
- **Cada iniciativa é reversível**: adicionar cache, índices ou módulos pode ser desligado sem perda de dados.
- **A Fase 1 deve preceder as demais**: sem observabilidade e testes, a evolução é cega.
- **Gate de qualidade**: nenhuma iniciativa avança sem que os testes passem e o deploy seja validado.

**Recomendações transversais:** segurança (CSP, HSTS, headers, sessões, rotação de segredos, auditoria), CI/CD (PRs obrigatórios, validações automáticas, deploy automatizado, preview), backup D1 (backup automático, restauração, validação periódica, retenção 30 dias).

### Motivo da escolha

- **Evolução sem quebrar**: cada iniciativa é aditiva e reversível, preservando a base existente.
- **Priorização fundamentada**: a Fase 1 (observabilidade e testes) precede funcionalidades, garantindo que evolução futura seja mensurável.
- **Documento vivo**: revisado a cada trimestre, acompanha a evolução do produto e do catálogo de fotógrafos.
- **Alinhamento ao produto**: o roadmap prioriza confiabilidade e escalabilidade, requisitos de uma plataforma premium.

### Alternativas consideradas

- **Reescrita completa em nova stack**: rejeitada — contraria o princípio de evoluir sem quebrar e descarta a base funcionando.
- **Roadmap fixo sem revisão**: rejeitado — não acompanha a evolução do produto.
- **Evolução sem Fase 1**: rejeitada — sem observabilidade e testes, a evolução é cega.

### Consequências

- **Benefícios:** evolução orientada, reversível, mensurável, com gate de qualidade.
- **Limitações:** o roadmap é orientativo, não contratual; a ordem dentro de cada fase pode ser reordenada conforme prioridade de produto.
- **Pontos futuros:** revisar o roadmap a cada trimestre e manter o estado das iniciativas sincronizado com a implementação e as evidências operacionais.

### Status

**Ativa.** Documento vivo, revisável a cada trimestre.

---

## Decisão 15 — Variantes de imagem por transformação on-demand (Cloudflare Images)

### Contexto

A iniciativa 4.3 do roadmap previa servir imagens de portfólio em tamanhos otimizados (thumbnail, médio, full), com duas abordagens possíveis: gerar três variantes fixas no upload — evitando o custo do Image Resizing — ou transformar on-demand. Até então, a foto original (até 4 MB no portfólio e 450 KB no perfil) era entregue integralmente em qualquer contexto — galeria, card, perfil — desperdiçando banda e degradando o LCP em mobile.

### Decisão tomada

As variantes são geradas **on-demand** pelo binding nativo `IMAGES` (Cloudflare Images), não no upload:

- O R2 armazena **apenas o original**; nenhuma variante é persistida.
- As rotas de imagem aceitam `?width=` com allowlist fechada (320, 640, 1280); fora da allowlist, o original é servido.
- Formato de saída AVIF quando o navegador anuncia suporte (`Accept`), senão WebP; quality 82.
- `Vary: Accept` separa as entradas de cache por formato; `Cache-Control` público (`max-age=300, stale-while-revalidate=86400`) para imagens públicas e privado (`max-age=300, must-revalidate`) para imagens autenticadas.
- A invalidação é resolvida por **versionamento de URL** (`?v=updated_at` embutido nos URLs emitidos pela API), sem purge.
- O helper é centralizado em `src/images.mjs` (`createImageService`), com dependências injetadas no padrão dos demais módulos; sem `env.IMAGES`, o comportamento cai no `storedImageResponse` original — reversível por construção.
- O frontend consome via `srcset`/`sizes` na galeria pública (2.3), na central da conta, no avatar do perfil público e nos cards da busca.

### Motivo da escolha

- **Simplicidade operacional**: um único objeto por imagem no R2, sem pipeline de upload, sem chaves de variante e sem invalidação coordenada entre chaves.
- **Custo já assumido**: o binding Cloudflare Images está habilitado no `wrangler.jsonc`; gerar no upload não eliminaria o serviço, apenas deslocaria o gasto.
- **Cache de borda compensa**: `stale-while-revalidate=86400` faz a primeira requisição pagar a transformação e as demais serem servidas da edge.
- **Reversibilidade**: allowlist fechada e fallback preservam o comportamento anterior quando o serviço está ausente.

### Alternativas consideradas

- **Pipeline de variantes no upload (4.3.a do roadmap)**: rejeitada nesta etapa — triplicaria o armazenamento no R2 e exigiria invalidação coordenada entre chaves antes de o volume justificar; pode ser revisada se o custo on-demand crescer.
- **Servir imagens por URL pública do R2**: rejeitada — contraria a Decisão 13 (R2 privado, sempre via Worker).
- **Redimensionamento próprio no Worker**: rejeitada — o binding nativo é gerenciado, mais rápido e sem dependência adicional.

### Consequências

- **Benefícios:** banda e LCP otimizados; armazenamento mínimo; código único para todos os tipos de imagem (portfólio e perfil).
- **Limitações:** custo por transformação on-demand (mitigado pela allowlist e pelo cache); latência adicional apenas na primeira requisição de cada variante.
- **Pontos futuros:** avaliar geração no upload se o volume justificar; monitorar o consumo do Cloudflare Images.

### Status

**Ativa.** Implementada nos PRs #78, #79, #80 e #84.

---

## Decisão 16 — Backup automático do D1 com retenção de 30 dias

### Contexto

O D1 oferece Time Travel sempre ativo nos bancos com armazenamento de produção, com janela de 7 dias no Workers Free e 30 dias no Workers Paid. As cópias SQL diárias no R2 complementam essa proteção com retenção própria de 30 dias; a restauração isolada foi validada em 18 de setembro de 2026 (5.2.b). Referência: [Time Travel e backups](https://developers.cloudflare.com/d1/reference/time-travel/).

### Decisão tomada

A política de continuidade dos dados é:

- **Frequência**: execução diária às 03:17 UTC (`cron: 17 3 * * *`, fora do minuto exato para não concorrer com outros agendamentos) + disparo manual (`workflow_dispatch`) com parâmetro `retention_days` (padrão 30).
- **Origem**: banco remoto `lensclick-db`, via `wrangler d1 export --remote` (sempre remoto — há regressão automatizada exigindo o flag).
- **Destino**: bucket R2 **`lensclick-backups`**, prefixo `daily/`, formato `backup-YYYYMMDDTHHMMSSZ.sql` (schema + dados). É um bucket **separado** do bucket de imagens (`lensclick-profile-images`), para que um erro de retenção ou permissão num não afete o outro. Ele **não é declarado em `wrangler.jsonc`** de propósito: o Worker não precisa acessar os backups (menor privilégio).
- **Retenção**: 30 dias por padrão, calculada pela data embutida no nome do arquivo (sem depender de metadados opcionais da API); objetos fora do padrão `backup-*.sql` são preservados.
- **Garantias do workflow**: falha sem `CLOUDFLARE_API_TOKEN`; falha se o export vier vazio (0 bytes arquivados seriam falsa sensação de segurança); confirma o objeto recém-enviado pela API da Cloudflare **sem baixar nem inspecionar o conteúdo**; concorrência com `cancel-in-progress: false` (um backup nunca é interrompido no meio); timeout de 20 minutos.
- **Credencial mínima**: token com edição no D1 (a API de export usa `POST`), leitura/escrita no R2 (de preferência restrita ao bucket de backup) e leitura de account; o account ID é resolvido a partir do próprio token quando o segredo opcional não existe. Segredos só via `secrets.*`, nunca no código.
- **Evidência operacional**: execução manual `33883526187` (4 de setembro de 2026) validou o fluxo completo — objeto `daily/backup-20260904T142433Z.sql` (15.662 bytes), retenção aplicada.

### Motivo da escolha

- **Redução do risco de perda**: complementa o Time Travel nativo do D1. Uma cópia diária não garante recuperação de alterações posteriores ao último export; a restauração isolada comprovou que o formato arquivado pode ser reaplicado com integridade.
- **SQL exportado no R2**: formato portável, com cópias identificadas pela data da execução.
- **Bucket separado do de imagens**: isola falhas de retenção e permissões entre dados críticos e assets.
- **Retenção pelo nome do arquivo**: determinística, sem depender de metadados que a API pode não retornar.
- **Confirmação sem download**: prova a existência do objeto remoto sem expor dados pessoais (o backup contém PII) nos logs.

### Alternativas consideradas

- **Arquivar no armazenamento local do runner**: rejeitado — efêmero (foi o bug corrigido no PR #98); o arquivo sumiria com a máquina do CI.
- **Reutilizar o bucket `lensclick-profile-images`**: rejeitado — acoplaria a retenção e as permissões dos backups às imagens de produto; um erro num afetaria o outro.
- **Storage externo fora da Cloudflare**: rejeitado nesta etapa — custo e complexidade adicionais sem benefício, já que o R2 atende com auditoria pela API.
- **Restore de teste contra produção**: rejeitado — restauração em produção só em incidente real; testes sempre em ambiente isolado.

### Consequências

- **Benefícios:** backup diário automático com confirmação remota, retenção explícita, credencial de privilégio mínimo, procedimento de restore documentado.
- **Limitações:** uma validação bem-sucedida não elimina a necessidade de testes periódicos; o backup contém dados pessoais e qualquer novo download exige autorização específica.
- **Pontos futuros:** repetir o restore isolado no mínimo trimestralmente e após mudanças relevantes de schema; a dependência crítica da automação de deploy (5.6) está atendida.

### Status

**Ativa e validada.** Política, automação e restore isolado concluídos; próxima revisão periódica até dezembro de 2026.

---

## Decisão 17 — HSTS, CSP de scripts e limite de sessões ativas

### Contexto

O LensClick já emitia cabeçalhos de segurança e mantinha sessões revogáveis no D1, mas ainda permitia JavaScript inline na CSP, não emitia HSTS e não limitava o número de sessões simultâneas por usuário. Além disso, a Cloudflare pode servir assets estáticos sem executar o Worker, portanto proteger apenas `responseHeaders` não cobriria todas as páginas.

### Decisão tomada

- **HSTS**: emitir `Strict-Transport-Security: max-age=63072000; includeSubDomains` em respostas dinâmicas e estáticas. Não usar `preload` nesta etapa.
- **CSP de scripts**: usar `script-src 'self'`, sem `'unsafe-inline'`; os scripts das páginas inicial, cadastro, login e recuperação de senha ficam em arquivos externos versionados em `public/`.
- **CSP de estilos**: manter temporariamente `'unsafe-inline'` em `style-src`, pois removê-lo exige uma migração visual separada.
- **Cobertura de assets**: manter os cabeçalhos em `SECURITY_HEADERS` para respostas do Worker e replicá-los em `public/_headers` para os assets servidos diretamente pela Cloudflare.
- **Sessões**: limitar cada usuário a cinco sessões ativas. A criação preserva sempre a sessão nova e remove excedentes do mesmo usuário no mesmo `env.DB.batch` que insere a sessão.

### Motivo da escolha

- **Defesa contra downgrade**: HSTS instrui navegadores a manter HTTPS após a primeira resposta segura.
- **Redução da superfície de XSS**: remover JavaScript inline permite uma política de scripts mais restritiva e testável.
- **Cobertura consistente**: `public/_headers` evita que páginas estáticas contornem os cabeçalhos por serem entregues antes do Worker.
- **Contenção de credenciais**: o teto de cinco sessões limita a persistência de acessos esquecidos ou comprometidos sem impedir o uso normal em múltiplos dispositivos.
- **Atomicidade**: inserir e podar sessões no mesmo batch evita deixar o limite parcialmente aplicado quando uma das instruções falha.

### Alternativas consideradas

- **HSTS com `preload`**: rejeitado nesta etapa; a inclusão na lista dos navegadores tem efeito duradouro e deve ocorrer somente após domínio próprio e decisão específica.
- **Executar o Worker antes de todo asset**: rejeitado; aumentaria invocações faturáveis. `_headers` aplica a proteção sem perder o caminho otimizado de assets estáticos.
- **Remover também `'unsafe-inline'` de `style-src`**: adiado para uma entrega visual própria, evitando quebra ampla de layout.
- **Sessões ilimitadas ou encerramento de todas no login**: rejeitados; a primeira opção amplia risco e a segunda prejudica o uso legítimo em vários dispositivos.

### Consequências

- **Benefícios:** HSTS e CSP consistentes em todas as páginas, scripts externos auditáveis e limite previsível de sessões por conta.
- **Limitações:** HSTS só protege após o primeiro acesso HTTPS; `style-src` ainda permite estilos inline; não há 2FA nem verificação de e-mail.
- **Operação:** alterações futuras na CSP devem manter `src/worker.mjs` e `public/_headers` sincronizados e cobertos por testes.

### Status

**Ativa e validada em produção.** Implementada nos PRs #104 e #105 e publicada na versão `0b72f0b4-b525-4b20-bdc3-f474574851bd` em 18 de setembro de 2026.

---

## Decisão 18 — Verificação de e-mail com login em modo de aviso (5.4.a)

### Contexto

Contas podiam ser criadas com e-mail não verificado, sem confirmação de titularidade e sem base para moderação futura. A iniciativa 5.4 do roadmap exige link de verificação, expiração e reenvio, além da decisão formal sobre bloquear ou apenas avisar no login.

### Decisão tomada

- **Modelo**: tabela `email_verification_tokens` (`token_hash` PK, `user_id` FK com `ON DELETE CASCADE`, `expires_at`, `used_at`) no padrão de `password_reset_tokens`, mais coluna `users.email_verified_at` (migração `0011`, imutável daqui em diante).
- **Token**: 32 bytes aleatórios em base64url, guardado como SHA-256, uso único via `UPDATE ... RETURNING`, TTL de 24 horas.
- **Rotas**: `POST /api/auth/email/verify` (pública, com token) e `POST /api/auth/email/resend` (autenticada, `SENSITIVE_RATE_LIMITER`).
- **Cadastro**: cria o token e envia o e-mail via Brevo em modo best-effort; falha no envio nunca quebra o `201`.
- **Reenvio**: exige sessão; conta já verificada recebe `200` sem novo e-mail; sem Brevo configurado responde `503`.
- **Login em modo de aviso**: login e `GET /api/auth/me` NÃO bloqueiam contas não verificadas; expõem `emailVerified` em `publicUser` para a interface avisar. Contas legadas (`email_verified_at IS NULL`) seguem funcionando.
- **Anti-enumeração**: verificação usa erro genérico; reenvio exige autenticação, portanto não expõe existência de contas.

### Motivo da escolha

- **Continuidade**: bloquear o login travaria toda a base existente, que não tem carimbo de verificação; o aviso preserva acesso enquanto a verificação é adotada progressivamente.
- **Bloqueio futuro**: o bloqueio passa a ser possível na 5.4.b/c, quando houver reenvio visível no perfil e papel administrativo para suporte.
- **Reuso**: o fluxo copia o padrão auditado de recuperação de senha (hash, consumo atômico, limpeza em falha de entrega, `waitUntil`).

### Alternativas consideradas

- **Bloquear login até verificar**: rejeitado nesta etapa; exigiria backfill e janela de suporte para contas legadas.
- **Reenvio público por e-mail**: rejeitado; reintroduziria enumeração; a versão autenticada elimina a classe de ataque.
- **TTL de 30 minutos como no reset**: rejeitado; verificação compete com caixa de entrada e filtros de spam — 24 horas equilibra segurança e conversão.

### Consequências

- **Benefícios:** titularidade confirmável, base para moderação (5.4.b/c) e portabilidade LGPD (5.5).
- **Limitações:** sem bloqueio, contas não verificadas continuam operando; sem 2FA; sem papel administrativo.
- **Operação:** expiração e uso único cobertos por testes; falha de entrega do Brevo gera `email.verification.delivery_failed`.

### Status

**Ativa.** Implementada na iniciativa 5.4.a; validação em produção pendente de deploy.

---

## Decisão 19 — Papel administrativo com `is_admin` e guard `requireAdmin` (5.4.b)

### Contexto

`role` (`client`/`photographer`) é dado de perfil com `CHECK` imutável na migração `0001` e nunca autorizou áreas. A moderação de avaliações (3.1) e de conversas (3.3) depende de um papel administrativo que não existia.

### Decisão tomada

- **Modelo**: coluna `users.is_admin` (`INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1))`, migração `0012`) em vez de novo valor em `role`. Contagem existente e `CHECK` original preservados.
- **Guard**: `requireAdmin` em `src/admin.mjs`, chamado no início de `dispatchApiRoute` para toda rota `admin.*`: sem sessão responde `401`; autenticado sem o papel responde `403` genérico.
- **Primeiro administrador**: atribuído por SQL pontual (`UPDATE users SET is_admin = 1 WHERE email = '...'`) via `wrangler d1 execute`. Nunca existe endpoint de promoção; o cadastro nunca define o papel.
- **Exposição**: `publicUser` inclui `isAdmin` para a interface decidir o que exibir; a autorização é sempre verificada no servidor a cada requisição.
- **Base do painel**: `GET /api/admin/overview` (somente leitura, contagens de usuários, não verificados, publicados, pendências e conversas ativas) como fonte de dados da futura 5.4.c.

### Motivo da escolha

- **Imutabilidade**: alterar o `CHECK` de `role` violaria a regra de migrações imutáveis; coluna própria é aditiva e reversível.
- **Negação por padrão**: o prefixo `admin.*` passa pelo guard antes de qualquer handler, então rotas futuras já nascem protegidas.
- **Sem auto-promoção**: sem endpoint de escrita no papel, a classe de escalação por API deixa de existir.

### Alternativas consideradas

- **Novo valor `admin` em `role`**: rejeitado; exigiria reescrever `CHECK` e migração publicada.
- **Reenvio/promoção por endpoint autenticado**: rejeitado; qualquer falha de guarda viraria escalação remota.
- **Lista de e-mails admin em variável de ambiente**: rejeitado; espalha controle de acesso para fora do banco auditável.

### Consequências

- **Benefícios:** moderação (5.4.c) desbloqueada; painel futuro já tem fonte de dados.
- **Limitações:** ainda não há interface nem ações de moderação; o primeiro admin exige acesso ao `wrangler`.
- **Operação:** promover somente contas com e-mail já verificado; revisar `is_admin = 1` periodicamente.

### Status

**Ativa.** Implementada na iniciativa 5.4.b; validação em produção pendente de deploy.

---

## Decisão 20 — Moderação administrativa de avaliações e conversas (5.4.c)

### Contexto

Com o papel administrativo criado (Decisão 19), faltava a operação: remover do público avaliações abusivas e encerrar conversas problemáticas, com reversão possível e trilha auditável.

### Decisão tomada

- **Avaliações**: `PUT /api/admin/reviews/:id` com `moderate` (`active` → `moderated`) e `restore` (`moderated` → `active`); cada transição grava `review_audit` com ator, nota, comentário e motivo. Avaliações `deleted` pelo autor não são tocadas pela moderação.
- **Efeito público**: agregados e listagens já filtram `status = 'active'`; moderar remove imediatamente de perfil, busca e médias, sem recalcular nada.
- **Conversas**: `PUT /api/admin/conversations/:id` com `close`/`reopen`; conversa encerrada bloqueia novas mensagens com `409` (comportamento já existente para participantes).
- **Listas**: `GET /api/admin/reviews` e `GET /api/admin/conversations` com filtro `status` e `limit` máximo de 50; sem conteúdo de mensagens no payload do admin.
- **Painel**: `public/admin.html` + `admin.js` externos (CSP `script-src 'self'`), com gate em `me.isAdmin` e chaves `admin.*` em PT/EN.

### Motivo da escolha

- **Reversibilidade**: `restore`/`reopen` evitam moderação irreversível por erro ou conta comprometida.
- **Auditoria**: ator e motivo registrados permitem contestação futura sem expor dados além do necessário.
- **Mínimo suficiente**: sem notificações, sem moderação de texto automática, sem edição de conteúdo alheio.

### Alternativas consideradas

- **Excluir a avaliação em vez de moderar**: rejeitado; apagaria a trilha e impediria restauração.
- **Editar comentário do autor**: rejeitado; viola autoria e impede auditoria fiel.
- **Incluir corpo das mensagens no painel**: rejeitado; amplia exposição de dados privados sem necessidade para encerrar uma conversa.

### Consequências

- **Benefícios:** Fase 5.4 encerrada; riscos residuais de 3.1/3.3 endereçados operacionalmente.
- **Limitações:** sem fluxo de denúncia pelo usuário; sem contestação formal; sem notificação às partes.
- **Operação:** moderar com motivo preenchido; revisar `moderated` periodicamente.

### Status

**Ativa.** Implementada na iniciativa 5.4.c; validação em produção pendente de deploy.

---

## Decisão 21 — Exportação de dados do titular (5.5.a)

### Contexto

A LGPD garante ao titular a portabilidade dos dados, mas não existia endpoint de exportação. O risco central é vazar dados de terceiros, pois conversas têm dois participantes.

### Decisão tomada

- **Rota**: `GET /api/account/export`, autenticada, sob `SENSITIVE_RATE_LIMITER` (5/hora), resposta JSON com `Content-Disposition: attachment`.
- **Inclui**: perfil (sem `password_hash`), perfil profissional, portfólio (metadados e URLs, sem binários do R2), solicitações e avaliações (autoria e recebimento), conversas do titular com mensagens, contatos e newsletter do próprio e-mail.
- **Escopo de terceiros**: mensagens recebidas e nomes de contraparte entram para dar contexto às conversas do titular; nenhum dado de contas sem vínculo com o titular é incluído.
- **Exclui**: `password_hash`, sessões, tokens, binários de imagem.

### Motivo da escolha

- **Portabilidade real**: JSON único, legível e reutilizável, sem exigir ferramenta proprietária.
- **Abuso contido**: rate limit rigoroso impede raspagem via exportação.
- **Revisão legal**: 5.5.b segue externa e pendente antes da publicação comercial.

### Alternativas consideradas

- **Exportar só mensagens do próprio autor**: rejeitado; conversa sem as respostas perde o sentido e frustra o direito.
- **Incluir binários do R2 em base64**: rejeitado; multiplica o tamanho e expõe URLs assinadas fora de controle.
- **Endpoint público com token por e-mail**: rejeitado; reintroduziria enumeração e entrega a terceiros.

### Consequências

- **Benefícios:** direito de portabilidade atendido no produto.
- **Limitações:** sem revisão legal formal, sem importação reversa.
- **Operação:** sem schema novo; nenhuma migration.

### Status

**Ativa.** Implementada na iniciativa 5.5.a; validação em produção pendente de deploy.

---

## Decisão 22 — Entrega automatizada com preview e deploy (5.6)

### Contexto

O único workflow validava sem publicar; deploys manuais via `wrangler deploy` variavam por máquina e não validavam o PR em ambiente real.

### Decisão tomada

- **Preview (5.6.a)**: job `preview` no CI sobe `wrangler dev --local` com D1 migrado, aguarda `/api/health` e executa `npm run test:smoke` (que escreve apenas no D1 local); o Worker é sempre encerrado (`if: always()`).
- **Deploy (5.6.b)**: workflow `deploy.yml` em `push` para `main` (após o Qualidade verde no PR) com gate próprio (`npm test` + `npm run check`), migration remota antes do upload e smoke somente leitura após publicar.
- **Concorrência**: deploy nunca é cancelado no meio (`cancel-in-progress: false`); qualidade/preview seguem canceláveis.
- **Segredo único**: `CLOUDFLARE_API_TOKEN`, como no backup (5.2), cuja rede de restore cobre falha de migration.

### Motivo da escolha

- **Rastreabilidade**: cada commit em `main` vira versão publicada com smoke registrado no resumo.
- **Falha cedo**: migration que quebra interrompe antes do upload, com backup diário como rede.
- **Sem escrita no smoke**: produção validada só com leituras e erros esperados (400/401).

### Alternativas consideradas

- **Deploy por ambiente de preview por PR (workers.dev preview)**: rejeitado; exigiria domínios e segredos por PR sem ganho frente ao `wrangler dev --local`.
- **Migration automática fora do deploy**: rejeitado; separaria schema de código e reintroduziria deriva manual.
- **Deploy sem gate próprio**: rejeitado; o push direto em `main` precisa validar mesmo com o PR verde.

### Consequências

- **Benefícios:** fim do deploy manual; validação real por PR.
- **Limitações:** sem rollback automático; sem estratégia blue/green (incompatível com o porte atual).
- **Operação:** monitorar a primeira execução real do `deploy.yml`; rollback manual via versão anterior do Worker + restore do backup (5.2).

### Status

**Ativa.** Implementada na iniciativa 5.6; validação em produção pendente da primeira execução real.

---

## Resumo

| # | Decisão | Status |
|---:|---|---|
| 1 | Plataforma serverless na Cloudflare Workers | Ativa |
| 2 | Cloudflare D1 como banco relacional | Ativa |
| 3 | Cloudflare R2 privado para imagens | Ativa |
| 4 | Frontend HTML/CSS/JS sem framework | Ativa (revisável) |
| 5 | Mesmo domínio para frontend e API | Ativa |
| 6 | Migrações versionadas e imutáveis | Ativa |
| 7 | Pull Requests obrigatórios | Ativa |
| 8 | Squash merge e proteção estrita de `main` | Ativa |
| 9 | Autenticação por sessões, PBKDF2 e Web Crypto | Ativa (revisável para 2FA) |
| 10 | i18n por catálogos com `lang.js`/`window.i18n` | Ativa |
| 11 | Design System com tokens `--lc-*` | Ativa (aliases temporários) |
| 12 | Agentes especializados do Copilot | Ativa |
| 13 | Segurança: R2 privado, validação, proteção de dados | Ativa (revisável para 2FA) |
| 14 | Roadmap técnico como documento vivo | Ativa (revisável trimestralmente) |
| 15 | Variantes de imagem on-demand (Cloudflare Images) | Ativa |
| 16 | Backup automático do D1 com retenção de 30 dias | Ativa e validada |
| 17 | HSTS, CSP de scripts e limite de sessões ativas | Ativa e validada |
| 18 | Verificação de e-mail com login em modo de aviso (5.4.a) | Ativa |
| 19 | Papel administrativo com `is_admin` e guard `requireAdmin` (5.4.b) | Ativa |
| 20 | Moderação administrativa de avaliações e conversas (5.4.c) | Ativa |
| 21 | Exportação de dados do titular (5.5.a) | Ativa |
| 22 | Entrega automatizada com preview e deploy (5.6) | Ativa |
| 23 | Qualidade com tokens únicos, lint e e2e em navegador real (5.7) | Ativa |

---

## Fontes utilizadas

- `docs/CONTEXTO_PROJETO.md` — seção 10 "Decisões arquiteturais já tomadas" (fonte primária das 10 decisões explícitas).
- `docs/HANDOFF.md` — decisões recentes, PRs, riscos e prioridades.
- `docs/ROADMAP_EVOLUCAO.md` — arquitetura atual, fases, princípios de execução e recomendações transversais.
- `docs/DOCUMENTACAO_TECNICA.md` — seções 3 (arquitetura), 6 (backend), 7 (autenticação), 8 (modelo de dados), 9 (R2), 10 (segurança), 14 (decisões arquiteturais).
- `README.md` — requisitos, scripts, dados e segurança.
- `DESIGN_SYSTEM.md` — princípios, tokens `--lc-*`, componentes e direção visual.

---

## Decisões que ainda precisam ser formalizadas no futuro

Estes pontos **não são decisões tomadas** — são candidatos a formalização conforme o produto evolui:

- **Segundo fator de autenticacao (2FA)**: hoje não existe; formalizar o mecanismo (TOTP, SMS, e-mail) quando for priorizado.
- **Papéis como autorização**: `client`/`photographer` seguem como dados de perfil; a autorização administrativa foi formalizada na Decisão 19 (`is_admin` + `requireAdmin`). O painel de moderação (5.4.c) segue pendente.
- **Domínio personalizado**: listado como prioridade média; a decisão sobre o domínio e a configuração ainda não está formalizada.
