# HANDOFF — LensClick

> Documento de transferência do projeto. Representa o estado atual e serve como guia para quem assumir o desenvolvimento a partir de agora.
>
> **Data de referência:** 21 de outubro de 2026, com a base `main` em `d22b1e0` (PR #138 mergeado e publicado).
> **Fonte primária:** `docs/CONTEXTO_PROJETO.md` + estado ao vivo do git.
> **Estado do roadmap:** Fases 1 a 4 concluídas. Na Fase 5, restam a revisão jurídica formal (5.5.b) e domínio/DNS/remetente Brevo (5.8.c). A **Fase 6** foi planejada para incorporar o aplicativo Android nativo em Kotlin, auditar e implementar sua paridade com a web, implementar o 2FA multicliente, validar web/API/Android e publicar com segurança na Google Play. O planejamento da 2FA já avançou: o **ADR 002** (`docs/ADR_002_AUTENTICACAO_EM_DUAS_ETAPAS.md`) está **Proposto** — threat model, comparação de opções e contratos de rotas definidos, sem implementação iniciada (Gate E). Plano detalhado em `docs/PLANO_ANDROID_VALIDACAO_PUBLICACAO.md`.

---

## 1. Situação atual da main

- **Base da entrega:** `main` → commit `d22b1e0` — "docs: ADR 002 da autenticacao em duas etapas (2FA)" (#138).
- **Working tree após a integração:** arquivos rastreados limpos e sincronizados com `origin/main`; artefatos locais não rastreados e alheios ao projeto devem ser preservados.
- **Sincronização:** `main` está alinhada com `origin/main` (nenhum commit local à frente ou atrás).
- **Proteção da branch (`main`):** configurada como **strict**:
  - Status checks obrigatórios: "Testes e validação" (CI GitHub Actions "Qualidade").
  - `enforce_admins`: true.
  - `required_linear_history`: true → **apenas fast-forward**, sem merge commits.
  - `allow_force_pushes`: false; `allow_deletions`: false.
  - `required_conversation_resolution`: true.
  - Revisões aprovadoras exigidas: 0 (mas o fluxo de PR é obrigatório).
- **CI:** workflow "Qualidade" executa instalação, `npm test`, lint, validação do Worker, preview local com D1, smoke HTTP e Playwright/Chromium. O deploy de produção é automatizado por `.github/workflows/deploy.yml` após push em `main`.
- **Ambiente de produção:** Cloudflare Worker em https://lensclick.renato-aparecido-business.workers.dev.
- **Repositório:** https://github.com/Renato1909/LensClick.git.

### Stack técnica

| Camada | Tecnologia |
|---|---|
| Runtime | Cloudflare Workers (serverless) |
| Banco de dados | D1 `lensclick-db` (SQLite) — 16 tabelas |
| Armazenamento de imagens | R2 `lensclick-profile-images` (bucket privado) |
| Assets estáticos | Workers Assets (`public/`) |
| E-mail transacional | Brevo |
| Senhas | Web Crypto — PBKDF2-SHA-256, 100k iterações |
| Frontend | HTML/CSS/JS vanilla, sem framework |
| i18n | Catálogos `public/locales/` + runtime `public/lang.js` (`window.i18n`) — PT-BR/EN-US |
| UX | `public/ux.js` (`window.LensClickUX`) |
| Design tokens | `public/refinements.css` (prefixo `--lc-*`) |
| Testes | Node.js test runner (`node --test`) — execute `npm test` para consultar o total atual |
| Node | >=22.13.0 (local: v24.22.0 portable em `D:\nodejs`) |
| Dependências de desenvolvimento | Wrangler ^4.0.0 e Playwright ^1.63.0 |

### Scripts disponíveis (`package.json`)

- `npm start` — sobe o Worker local (porta 4174; `prestart` roda `db:migrate:local`).
- `npm run dev` — modo watch.
- `npm run check` — `wrangler deploy --dry-run` (valida build sem publicar).
- `npm run lint` — valida aliases visuais, scripts inline, uso de dados locais e sintaxe JavaScript.
- `npm test` — `node --test`.
- `npm run test:smoke` — smoke HTTP (`scripts/http-smoke.mjs`).
- `npm run test:e2e` — executa os fluxos críticos em Chromium com Playwright.
- `npm run db:migrate:local` / `db:migrate:remote` — aplica migrações D1.

### Tabelas D1 (16)

`users`, `sessions`, `password_reset_tokens`, `email_verification_tokens`, `contact_messages`, `newsletter_subscriptions`, `rate_limits`, `professional_profiles`, `portfolio_items`, `review_requests`, `reviews`, `review_audit`, `conversations`, `messages`, `monitor_state`, `monitor_minute_buckets`.

### Migrações publicadas (14)

`0001_initial.sql` … `0010_monitor_minute_buckets.sql`, `0011_email_verification.sql`, `0012_admin_role.sql`, `0013_portfolio_cover_category.sql`, `0014_sessions_kind.sql`.

> ⚠️ **Regra de ouro:** nunca editar migrações já publicadas. Criar nova `0015_*.sql` para qualquer alteração de schema.

> O ADR 002 prevê a migration `0015_two_factor.sql` (colunas em `users` + 3 tabelas novas), mas ela **não existe**: até a aprovação da decisão, nenhum schema foi alterado. O total de migrações publicadas permanece 14.

---

## 2. Branches atuais

- **Branches locais permanentes:** somente `main`.
- **Clone local único:** `D:/LensClick - Recomeço` é o working tree canônico do projeto. Os clones anteriores (`D:/LensClick` e `D:/LensClick - Atualizado`) estão obsoletos e devem ser descartados.
- **Branches remotas:** somente `origin/main` (além do ponteiro simbólico `origin/HEAD -> origin/main`).
- **Branches sem upstream:** nenhuma.
- **Trabalho pendente em branches:** nenhum.

A limpeza controlada foi concluída após comparar a árvore de cada branch obsoleta com o commit squash correspondente em `main`. As duas branches locais que estavam órfãs também apresentaram conteúdo idêntico aos PRs #2 e #3 já incorporados; nenhum trabalho exclusivo foi removido.

---

## 3. Funcionalidades em desenvolvimento

Não há funcionalidade em desenvolvimento numa branch pendente. As Fases 1 a 4 e as iniciativas 5.1, 5.2, 5.3, 5.4, 5.6 e 5.7 estão concluídas; 5.5 e 5.8 dependem apenas das atividades externas listadas abaixo. O catálogo e o despacho HTTP ficam em `src/router.mjs`; os handlers de domínio vivem em módulos próprios, incluindo `src/admin.mjs`, e o `worker.mjs` permanece como ponto de composição. As funcionalidades abaixo já estão em `main` e em produção:

### Funcionalidades entregues

- **Landing page** (`public/index.html`) — redesign editorial premium, hero com CTA para busca.
- **Cadastro e login** — autenticação com PBKDF2, sessões em D1.
- **Recuperação de senha** — fluxo via Brevo com tokens de uso único (`password_reset_tokens`).
- **Verificação de e-mail** — token de uso único e reenvio; login opera em modo de aviso para contas ainda não verificadas.
- **Central da conta** (`public/perfil.html`) — edição de perfil, troca de senha, exclusão definitiva.
- **Onboarding profissional guiado** (`public/perfil.html`) — fluxo em etapas, validação contextual e retomada do rascunho persistido no D1.
- **Upload de foto de perfil** — armazenamento em R2 (bucket privado).
- **Exclusão definitiva da conta** — com confirmação e limpeza de dados.
- **Perfil profissional público** (`public/fotografo.html`) — `professional_profiles`.
- **Portfólio** — até 12 itens por fotógrafo, imagens em R2 (`portfolio_items`), com legenda, descrição alternativa, categoria e uma capa opcional.
- **Página pública do fotógrafo** — exibe perfil + portfólio.
- **Busca** (`public/busca.html`) — filtros por cidade/estado, preservação de cidade ao trocar estado.
- **Contato** — formulário com `contact_messages`.
- **Newsletter** — inscrições em `newsletter_subscriptions`.
- **Busca avançada** — faixa de preço, raio de serviço e ordenação por recomendação, preço, raio, avaliação ou atualização (Fase 2.2).
- **Avaliações e reputação** — solicitação de contato, confirmação pelo fotógrafo e nota verificada, com média pública e trilha de auditoria (Fase 3.1).
- **Mensagens internas** — conversa persistente entre cliente e fotógrafo, com inbox, paginação e contador de não lidas (Fase 3.3).
- **Administração e moderação** — papel administrativo protegido por `requireAdmin`, painel de avaliações e controle de encerramento/reabertura de conversas.
- **Portabilidade LGPD** — exportação autenticada dos dados do titular em JSON, sem hashes de senha nem binários do R2.
- **Perfis indexáveis** — rota `/fotografo/:slug` com SSR, canonical, Open Graph e JSON-LD (Fase 3.2).
- **Sitemap e robots** — gerados dinamicamente a partir dos perfis publicados (Fase 3.4).
- **Metadados sociais** — canonical, Open Graph, Twitter Cards e JSON-LD nas páginas públicas estáticas e nos perfis SSR. O **Worker é a fonte única de verdade**: `src/worker.mjs` emite os metadados do que é servido, a partir de uma política por caminho; os arquivos HTML carregam apenas a `meta description` (texto-fonte em PT-BR), que é lida e propagada para `og:description` e JSON-LD. Duplicar canonical ou `og:*` nos arquivos seria danoso (o Google ignora dois `rel="canonical"` conflitantes e cada rede social lê a primeira ou a última ocorrência de `og:image`). Matriz de indexabilidade: indexáveis `/`, `/busca.html`, `/termos.html`, `/privacidade.html`; `noindex, follow` nas cinco páginas de autenticação; `noindex, nofollow` em `/perfil.html` e `/admin.html` (também por header `X-Robots-Tag`). O canonical é derivado do host a partir de um **path**, sem query string — assim o domínio próprio (5.8.c) entra sem alteração de código.
- **Observabilidade e alertas** — logs estruturados com `X-Request-ID`, SLOs definidos e sondas in-worker de disponibilidade, P95 e taxa de 5xx (Fases 1.1 e 4.4).
- **Entrega automatizada** — CI com lint, testes, preview, smoke e E2E; deploy de produção automatizado após integração na `main`.
- **Bilíngue PT-BR/EN-US** — catálogos JSON separados, fallback progressivo e runtime `public/lang.js` com `window.i18n`.
- **Header redesign** — botão de busca responsivo.
- **Redesign editorial** — textura de fundo premium.

### Não implementado / pendente

- Fase 6: o aplicativo Android nativo em Kotlin existe fora desta árvore; seu projeto Android Studio ainda precisa ser disponibilizado, versionado e auditado antes de qualquer afirmação de paridade ou publicação.
- Fase 6: paridade funcional, matriz de testes e publicação Google Play ainda não foram executados. O contrato de autenticação móvel está publicado no ADR 001 e o 2FA está projetado no ADR 002 (Proposto, sem implementação).
- 5.8.c: domínio próprio, DNS e remetente Brevo no domínio.
- 5.5.b: revisão legal formal dos Termos de Uso e da Política de Privacidade.
- 2FA continua fora do escopo atual: o ADR 002 está **Proposto** (TOTP + 10 códigos de recuperação de uso único, opt-in na fase 1), mas nenhuma rota, migration ou binding foi criado — a implementação depende da aprovação do mantenedor.
- O rate limiting permanece deliberadamente híbrido: escudo de rajada nativo na edge e políticas longas autoritativas no D1.
- A suíte de contratos cobre as 43 rotas e os 48 contratos HTTP catalogados (incluindo autenticação móvel revogável); apenas os 3 fluxos críticos têm cobertura em navegador real, e testes ponta a ponta com serviços reais permanecem fora do escopo atual.
- O endpoint `GET /api/health` verifica Worker e D1; o R2 é monitorado pelas rotas reais de imagem para evitar operações artificiais de armazenamento.

---

## 4. PRs relevantes

Todos os PRs listados abaixo já foram **mergeados** em `main`. Histórico (squash, fast-forward):

| PR | Commit | Descrição |
|---|---|---|
| #1 | `9cafefd` | Configura qualidade e fluxo de Pull Requests |
| #2 | `f11180d` | Implementa recuperação segura de senha |
| #3 | `78f94d1` | Adiciona gerenciamento seguro da conta |
| #4 | `d319841` | Adiciona exclusão definitiva e segura da conta |
| #5 | `91e35d0` | Adiciona perfil profissional público |
| #6 | `ddcaf7d` | Adiciona portfolio profissional no R2 |
| #7 | `f06a78b` | feature(busca): UI de busca e i18n |
| #8 | `2bf6b9a` | feat: visual improvements for search page |
| #9 | `ec6970d` | feat: hero CTA linking to search + i18n |
| #10 | `3b16f9c` | fix: hero CTA styling + i18n cleanup |
| #11 | `b05ebca` | fix(header): redesign search button |
| #12 | `b0c268d` | Improve city/state selection logic in search |
| #13 | `7b5bd3b` | feat: redesign editorial com textura de fundo premium |
| #14 | `4721d1d` | fix: corrigir erro Assignment to constant no public-shell |
| #16 | `fc45330` | docs: finalize technical roadmap baseline |
| #17 | `f3bcb1d` | chore: adiciona 10 agentes do Copilot |
| #18 | `2beb80a` | docs: add permanent project context |
| #19 | `44efde5` | docs: update project handoff |
| #20 | `3db387b` | fix: sync schema catalog with migrations |
| #21 | `e143d23` | docs: update test documentation |
| #22 | `ba2a8d8` | feat: add structured observability |
| #23 | `84cea0c` | docs: finalize observability handoff |
| #24 | `051c6be` | docs: record observability deployment |
| #25 | `26f9124` | test: add authentication route contracts |
| #26 | `af8674f` | test: add account route contracts |
| #27 | `6720d61` | test: add portfolio and public route contracts |
| #28 | `0aad905` | test: complete API route contracts |
| #29 | `11d11aa` | docs: finalize route contract handoff |
| #30 | `3f95de2` | feat: add native rate limit shield |
| #31 | `d4621b3` | docs: record rate limit production validation |
| #32 | `f94413e` | feat: add D1 health check and search indexes |
| #33 | `57b0e8c` | docs: close D1 health initiative |
| #34 | `de4c2d0` | refactor: extract request router |
| #35 | `52dbeb7` | docs: close router transition |
| #36 | `8b44417` | feat: add guided photographer onboarding |
| #37 | `2c06174` | docs: close guided photographer onboarding |
| #38 | `2a2b672` | Fase 2.2: adiciona filtros e ordenacao na busca |
| #39 | `717a03a` | docs: close advanced search initiative |
| #40 | `d5ce86a` | feat: add responsive portfolio gallery |
| #41 | `11c078f` | docs: close responsive portfolio initiative |
| #42 | `4e2b52d` | feat: add catalog-based internationalization |
| #43 | `bc1a14b` | docs: close catalog internationalization phase |
| #44 | `14df46f` | feat: adicionar avaliacoes e reputacao verificadas |
| #45 | `b9bee0f` | Documentar conclusão da Fase 3.1 |
| #46 | `db29294` | fix: stabilize verified reputation flow |
| #47 | `f1a5e03` | feat: add indexable photographer profiles |
| #48 | `b6b88eb` | fix: fetch profile template with explicit request |
| #49 | `2e3b936` | docs: close phase 3.2 |
| #50 | `d3f3b88` | feat: add persistent conversation API |
| #51 | `e87d972` | feat: add conversation interface |
| #52 | `1e6c640` | docs: close phase 3.3 |
| #53 | `0a70e2a` | feat: add dynamic sitemap and robots |
| #54 | `e8a6b5f` | fix: qualify sitemap timestamps |
| #55 | `0295292` | fix: order sitemap profiles by user id |
| #56 | `77e3df6` | docs: close phase 3.4 |
| #57 | `0997afb` | feat: add edge cache for public discovery |
| #58 | `0a39460` | docs: close phase 4.1 |
| #59 | `a6fe1a1` | refactor: extract authentication handlers |
| #60 | `b511e5b` | docs: record phase 4.2 authentication extraction |
| #61 | `b581001` | refactor: extract photographer read handlers |
| #62 | `c5ce3a1` | docs: record photographer handler extraction |
| #63 | `9df8b7e` | refactor: extract photographer public read handlers |
| #64 | `4de3765` | docs: record photographer public reads |
| #65 | `fc08240` | refactor: extract photographer review request handler |
| #66 | `46c02d0` | refactor: extract photographer conversation handler |
| #67 | `660d87d` | refactor: extract professional profile read handler |
| #68 | `3d994ab` | refactor: extract professional profile update handler |
| #69 | `2c148fb` | refactor: extract review request listing handler |
| #70 | `b83b843` | refactor: extract review request update handler |
| #71 | `1fb5163` | refactor: extract review creation handler |
| #72 | `8d1ccc7` | refactor: extract review maintenance handlers |
| #73 | `59f30d2` | refactor: extract account conversation handlers |
| #74 | `f42ab1d` | refactor: extract public input handlers |
| #75 | `f20350f` | refactor: extract account portfolio listing |
| #76 | `e9d47f3` | refactor: extract portfolio mutations |
| #77 | `af88201` | refactor: extract account security handlers |
| #78 | `b3cbaac` | feat: add optional portfolio image transformations |
| #79 | `da30690` | feat: integrate responsive portfolio images |
| #80 | `e183573` | feat: finalize responsive image cache policy |
| #81 | `cc55fa2` | docs: define observability SLOs |
| #82 | `f9d8e53` | refactor: remove disabled handler blocks left by domain extraction |
| #83 | `2a0f249` | docs: record Fase 4.2 completion across state docs |
| #84 | `e0e83a7` | feat: extend responsive image variants to profile photos |
| #85 | `59c0872` | docs: record Fase 4.3 completion and register Decisão 15 |
| #86 | `f4d3bfb` | docs: record Fase 4.3 production deployment |
| #87 | `7df1dd1` | feat: availability probe with automated alerting (Fase 4.4) |
| #88 | `c0198b2` | docs: record Fase 4.4 completion across state docs |
| #89 | `c513c8e` | fix: add LGPD high-priority disclosures to privacy policy |
| #90 | `650a712` | docs: record LGPD high-priority compliance progress |
| #91 | `8532266` | fix: medium-priority legal compliance for terms and privacy policy |
| #92 | `d37b33f` | docs: record LGPD medium-priority compliance progress |
| #93 | `ad203ec` | feat: add sec11 General Provisions + language toggle on legal pages |
| #94 | `c398788` | docs: mark optional LGPD provisions complete |
| #95 | `ca3eee2` | feat(monitoring): alertas in-worker de P95 e taxa de 5xx (Fase 4.4) |
| #96 | `86d3c3f` | docs: registra conclusao da Fase 4.4 com evidencias do deploy |
| #97 | `3212a02` | docs: planeja a Fase 5 e automatiza o backup do D1 |
| #98 | `128c295` | fix: enviar backup do D1 ao R2 remoto |
| #99 | `87f11db` | fix: tornar retencao do backup robusta |
| #100 | `dcfb5fd` | docs: registra backup remoto validado |
| #101 | `bbd4c34` | docs: formaliza backup do D1 como Decisão 16 (5.2.c) |
| #102 | `7ee0870` | docs: conclude phase 5.1 consolidation |
| #103 | `d1c984d` | docs: conclude isolated D1 restore validation |
| #104 | `9b6cf21` | security: enforce HSTS and strict script CSP |
| #105 | `4adb964` | security: limit active account sessions |
| #106 | `62857da` | docs: conclude phase 5.3 security hardening |
| #107 | `6252b5f` | docs: fix HANDOFF base to 62857da with PR 106 |
| #108 | `365d6b4` | feat(auth): email verification with warn-only login (5.4.a) |
| #109 | `91bd1b6` | feat(auth): admin role with requireAdmin guard (5.4.b) |
| #110 | `7aff8ed` | docs: record 5.4.a and 5.4.b production rollout in HANDOFF |
| #111 | `33ad80f` | feat(admin): moderation panel for reviews and conversations (5.4.c) |
| #112 | `4a93058` | docs: record 5.4.c production rollout and close Phase 5.4 in HANDOFF |
| #113 | `162bf44` | feat(account): titular data export for LGPD portability (5.5.a) |
| #114 | `5bb5249` | feat(ci): local preview with smoke and automated production deploy (5.6) |
| #115 | `630be7b` | fix(ci): fail fast when token lacks Workers deploy access |
| #116 | `2214e75` | feat(quality): single-source tokens, frontend lint and real-browser e2e (5.7) |
| #117 | `6ec4631` | fix(e2e): prevent professional profile loading race |
| #118 | `02dd814` | docs: sync roadmap and project documentation after PR 117 |
| #119 | `eea0009` | feat: advance roadmap 5.8 product and digital presence |
| #120 | `90e67f7` | docs+test: sync HANDOFF to 5.8 partial and harden e2e checkbox handling |
| #121 | `6fcbcfb` | fix(e2e): explicit waits for professional section and panels |
| #122 | `9252f9c` | fix(e2e): assert personal save success and persisted role before publish |
| #123 | `8a3a66f` | docs: sync HANDOFF to base 9252f9c with PRs 120-122 |
| #124 | `f89b63e` | docs: consolidate permanent docs after 5.8 partial |
| #125 | `eec5909` | fix(e2e): explicit timeouts for panel visibility and checkbox state |
| #126 | `a261502` | docs: atualiza handoff ao estado atual |
| #127 | `c3358c2` | docs: planeja convergencia e publicacao Android |
| #128 | — | feat: adicionar autenticacao movel revogavel (squash sem numero de merge no log) |
| #129 | `d8b3cd9` | docs: align handoff with phase 5 completion |
| #130 | `6f0f2af` | docs: ADR 001 da autenticacao movel com decisoes e riscos pos-merge |
| #131 | `b755a63` | ci: smoke diario agendado as 04h (BRT) via GitHub Actions |
| #132 | `522543d` | feat: fecha os 3 criticos do ADR 001 de autenticacao movel (0014_sessions_kind.sql) |
| #133 | `6acc6c2` | docs: sync HANDOFF to base 522543d with PRs 126-132 and migration 0014 |
| #134 | `35e285b` | feat: importa os 11 agentes do Copilot para o OpenCode |
| #135 | `05bcb2c` | refactor: migra aliases visuais legados para tokens --lc-* |
| #136 | `72f182e` | feat: torna os 12 agentes selecionaveis no chat (mode: primary) — squash vazio: o `mode: primary` já havia entrado em `main` pelo PR #135 |
| #137 | `f5c8f04` | perf: alinha preload do hero, remove CSS morto e paraleliza carga da conta (iniciativa A2) |
| #138 | `d22b1e0` | docs: ADR 002 da autenticacao em duas etapas (2FA) — status Proposto |
| #139 | `28ad193` | docs: sync HANDOFF to base d22b1e0 with PRs 133-138, ADR 002 and OpenCode agents |
| #140 | `9a2210d` | fix(opencode): agentes do projeto com `mode: all` e `default_agent` para o cliente desktop |
| #141 | `a61d5f9` | chore(deps): atualiza o toolchain de desenvolvimento e zera o `npm audit` |
| #142 | `712cd77` | chore(ambiente): mantém o toolchain do projeto no disco D: (sem escrita no C:) |
| #143 | `0489ab8` | fix(db): sincroniza o catalogo `db/schema.ts` com a migration 0014 e adiciona guarda de consistencia |
| #144 | `d915f56` | chore(ci): atualiza `actions/checkout` e `actions/setup-node` para v7 |
| #145 | — | fix(seo): corrige canonical, indexabilidade, `og:image` e JSON-LD das páginas públicas |

> Nota: o PR #15 não aparece no histórico mergeado consultado; a numeração foi pulada ou o PR não foi integrado.

---

## 5. Decisões recentes

- **Fluxo de PR obrigatório** — toda alteração via Pull Request, squash merge, fast-forward only. Branch protection strict em `main`.
- **Squash merge** — commits de PR são squashed em um único commit no histórico. Por isso os branches locais ficam obsoletos após o merge.
- **Agentes Copilot** — o PR #17 adicionou 10 agentes em `.github/agents/` (Arquiteto, Backend, Frontend, Banco de Dados, DevOps, QA, Segurança, SEO/Performance, Marketing, Revisor de Código). O repositório possui **11 agentes no total**: o Designer já havia sido adicionado anteriormente pelo PR #13.
- **Roadmap técnico baseline** documentado (PR #16) — `docs/ROADMAP_EVOLUCAO.md` com Fases 1 a N.
- **Contexto permanente versionado** (PR #18) — `docs/AI_CONTEXT.md`, `docs/CONTEXTO_PROJETO.md`, `docs/HANDOFF.md` e `docs/DECISOES_TECNICAS.md` foram incorporados à `main`.
- **Design System** formalizado em `DESIGN_SYSTEM.md` e tokens `--lc-*` em `public/refinements.css`.
- **i18n por catálogos** em `public/locales/`, coordenado por `public/lang.js` — toda string de UI passa por `window.i18n` e mantém paridade PT-BR/EN-US.
- **R2 privado** — imagens de perfil e portfólio não são públicas; servidas via Worker.
- **Agentes do projeto no OpenCode** — `.opencode/agents/*.md` com `mode: all` (funcionam como agente principal e como subagente) e `.opencode/opencode.json` com `default_agent: "arquiteto-de-software"`. No TUI, `Ctrl+X` e depois `A` lista os agentes e `Shift+Tab` alterna entre eles; no CLI, `opencode run --agent <id>`. O cliente desktop v2.1.1 não tem seletor de agentes e por isso depende do `default_agent`.
- **Brevo** como provedor de e-mail transacional (recuperação de senha, verificação de e-mail e alertas operacionais).
- **Migrações imutáveis** — regra estabelecida: nunca editar migração publicada.
- **Toolchain auditado** — o PR #141 atualizou o lockfile para `wrangler` 4.151.3 (de 4.118.0), levando o `npm audit` a **0 vulnerabilidades**, e realinhou o `allowScripts` do `package.json`. O bundle publicado permaneceu **byte-idêntico** (SHA-256 `FAF38EFE…`), provando risco zero no artefato. O gate `npm audit --audit-level=high` é informativo no CI de PR e bloqueante no job diário. Detalhes em `docs/DEPENDENCIAS_E_SEGURANCA.md`.
- **Toolchain no disco D:** — decisão de infraestrutura: o projeto, o clone, as dependências e todo o ferramental (Node, npm, Playwright, wrangler e o OpenCode) ficam no HDD, e o SSD não recebe escrita do fluxo de trabalho. Implementado por variáveis de ambiente de usuário aplicadas por `scripts/env-local.ps1`, com a ordem de migração dos dados do OpenCode documentada na seção "Ambiente (Windows)".
- **Contratos por rota** — a infraestrutura compartilhada cobre atualmente 43 padrões de rota e 48 contratos HTTP catalogados.
- **Rate limiting híbrido** — a iniciativa 1.3 adicionou quatro bindings nativos de 60 segundos como escudo de rajada e preservou as políticas longas no D1 como camada autoritativa e fallback.
- **Health check mínimo e seguro** — `GET /api/health` executa `SELECT 1` no D1, retorna somente estado genérico e não consulta o R2 para evitar operações artificiais.
- **Índices orientados pelas consultas reais** — a migration `0005` adicionou índices para listagem, estado e disponibilidade; o índice explícito redundante de `slug` foi removido, preservando o autoíndice da restrição `UNIQUE`.
- **Roteador declarativo extraído** — o PR #34 criou `src/router.mjs` com as 25 combinações HTTP catalogadas, preservando origem, parâmetros dinâmicos, respostas e entrega de assets.
- **2FA projetado no ADR 002** — o PR #138 registrou a decisão de autenticação em duas etapas: TOTP (RFC 6238) + 10 códigos de recuperação de uso único, opt-in na fase 1 com obrigação para `is_admin` após janela de migração, desafio com TTL de 5 min, dispositivo confiável de 90 dias revogável e desativação que revoga todas as sessões web e móveis. Passkeys/WebAuthn ficaram como evolução futura (o schema já foi projetado para receber `method`); código por e-mail e push approval foram rejeitados como fator primário. Status **Proposto**: o Gate E exige aprovação antes de qualquer implementação.
- **Agentes portados para o OpenCode** — os PRs #134 a #136 trouxeram os 11 agentes do Copilot para `.opencode/agents/` com `mode: primary` (selecionáveis no chat), mais o agente `explore`, totalizando 12. O PR #136 foi mergeado como squash vazio, porque o `mode: primary` já havia entrado em `main` pelo PR #135. O PR #140 elevou os 12 para `mode: all`, habilitando também a delegação por subagente, e fixou `default_agent: "arquiteto-de-software"` em `.opencode/opencode.json` — o cliente desktop (v2.1.1) não expõe seletor de agentes, então o default é o que faz o projeto usar seus agentes ali.
- **Iniciativa A2 de performance** — o PR #137 alinhou o preload do hero à URL real do elemento LCP (`w=1600`), removeu ~2,4 KB de CSS morto, trocou `background-attachment: fixed` por `scroll` em telas ≤880px, normalizou `lang="pt-BR"` e paralelizou as chamadas `/api/account/professional-profile` e `/api/account/portfolio` na central da conta.

---

## 6. Riscos conhecidos

### Críticos

1. **Sem 2FA e verificação de e-mail não bloqueante** — a verificação existe, mas a Decisão 18 mantém o login em modo de aviso; contas não verificadas ainda podem entrar. O 2FA permanece não implementado: o ADR 002 está Proposto e não inicia implementação. Riscos já assumidos no ADR: segredo TOTP em claro no D1 (runbook de rotação pendente), phishing residual de TOTP e derivas de relógio.
2. **Políticas longas ainda usam D1** — o escudo nativo protege rajadas, mas as janelas de 15 minutos e 1 hora continuam em `rate_limits`. A arquitetura é intencional e segura, porém ainda consome D1 nas rotas protegidas.

### Técnicos

3. **Hotspots de conflito** — `src/worker.mjs` e os catálogos em `public/locales/` são tocados por muitas features. Alto risco de conflito de merge.
4. **Health check não cobre R2** — decisão deliberada para não gerar operações artificiais; indisponibilidade do bucket é detectada pelos eventos das rotas reais de imagem.
5. **Cache de descoberta com TTL curto** — buscas e perfis públicos usam `caches.default` por 60 segundos; alterações podem permanecer stale por esse intervalo.
6. **Cobertura E2E seletiva** — somente três fluxos críticos rodam em navegador real contra o preview local; integrações ponta a ponta com serviços externos continuam fora do escopo.
7. **CSP de estilos ainda permissiva** — `script-src` já não usa `'unsafe-inline'`, mas `style-src` o preserva temporariamente; sua remoção exige uma entrega visual separada.
8. **Toolchain de desenvolvimento pode derivar** — o projeto não tem dependências de runtime, mas `wrangler` → `miniflare` → `undici` + `sharp` carregam advisories em versões antigas; o lockfile ficou 3 meses sem atualização. O gate `npm audit --audit-level=high` no job diário sinaliza a deriva, e a política está em `docs/DEPENDENCIAS_E_SEGURANCA.md`. Impacto restrito a DoS local em dev/CI.

### Legais / Processo

8. **Revisão jurídica externa pendente** — as adequações LGPD de alta e média prioridade já estão em produção, mas Termos de Uso e Política de Privacidade ainda exigem revisão legal formal antes da publicação comercial.

---

## 7. Tarefas prioritárias

Prioridades derivadas de `docs/CONTEXTO_PROJETO.md` e `docs/ROADMAP_EVOLUCAO.md`. A limpeza de branches foi concluída e os documentos permanentes de contexto foram versionados pelo PR #18. As prioridades pendentes agora são:

### P3 — Fase 1 do Roadmap (médio prazo, médio risco)
- **1.1 Observabilidade** — concluída: integrada pelo PR #22, publicada e validada em produção.
- **1.2 Suíte de testes por rota** — concluída pelos PRs #25–#28: 21 padrões de rota e 24 contratos HTTP cobertos; 116 testes aprovados no snapshot de integração.
- **1.3 Rate limiting nativo Cloudflare** — concluída pelo PR #30 e validada em produção após aproximadamente 58 horas: 0 respostas `429` inesperadas, 0 erros `5xx` e nenhum rollback.
- **1.4 Índices e health check D1** — concluída pelo PR #32: migration `0005` aplicada no D1 remoto, `GET /api/health` validado com `200`, buscas públicas validadas e versão `83c02bf5-5fa3-4ce2-ac66-d2023a5f82ba` servindo 100% do tráfego, sem rollback.

### Marco de transição entre Fases 1 e 2 (concluído)
- Integrado pelo PR #34 com catálogo declarativo em `src/router.mjs` e handlers preservados em `src/worker.mjs`.
- Validado com 128 testes, smoke local completo, CI e smoke de produção.
- Versão `c989bdad-ea2a-4b33-8088-f16ae355928b` servindo 100% do tráfego; zero `5xx`, zero erro operacional e nenhum rollback no smoke inicial.

### Fase 2.1 — concluída
- Integrada pelo PR #36 com wizard acessível e bilíngue, validação por etapa e retomada do rascunho persistido pela API existente no D1.
- Validada com 129 testes, build do Wrangler, CI, revisão visual local e smoke de produção.
- Versão `8df9581d-5dc9-40b2-80c3-76b52e12865e` servindo 100% do tráfego; zero `5xx`, zero exceção operacional e nenhum rollback no smoke inicial.

### Fase 2.2 — concluída
- Integrada pelo PR #38 com filtros de preço mínimo/máximo e raio mínimo, além de ordenação por recomendação, preço, raio e atualização recente.
- Paginação e privacidade dos perfis não publicados foram preservadas; a ordenação usa allowlist e a migration `0006` adiciona índices para preço e raio.
- Validada com 130 testes, build do Wrangler, CI, smoke HTTP local, health check e busca avançada em produção.
- Versão `ea2cfd01-fa8c-4770-b81d-9209fb2af021` servindo 100% do tráfego; migration remota aplicada e nenhuma pendência no D1.

### Fase 2.3 — concluída
- Integrada pelo PR #40 com galeria editorial responsiva, lista acessível, dimensões explícitas, `sizes`/`srcset`, carregamento progressivo, fallback bilíngue de erro e respeito a movimento reduzido.
- Validada com 131 testes, build do Wrangler, CI, revisão visual em desktop e mobile, troca PT/EN e smoke de produção sem erros `5xx`.
- Versão `24d21de1-bd1f-4450-b4a3-37bb09500890` publicada sem necessidade de rollback. As variantes reais de imagem permanecem, intencionalmente, no escopo da iniciativa 4.3.

### Fase 2.4 — concluída
- Integrada pelo PR #42 com catálogos independentes PT-BR/EN-US, contrato de 500 chaves por locale, cache, fallback progressivo, interpolação e uma API única em `window.i18n`.
- Textos estáticos e dinâmicos das páginas públicas, autenticação, busca, perfil e portfólio foram migrados; a transição vertical aprovada e o suporte a movimento reduzido foram preservados.
- Validada com 134 testes, build do Wrangler, CI, revisão visual desktop/mobile e smoke de produção somente leitura.
- Versão `a840abe4-6245-4616-8b06-1814587a7991` publicada sem necessidade de rollback; banco, migrations e contratos da API permaneceram intactos.

### Fase 3.1 — concluída
- Integrada pelo PR #44 com solicitação de contato pelo cliente, confirmação ou rejeição pelo fotógrafo e uma avaliação verificada de 1 a 5 estrelas por contato confirmado.
- Avaliações podem ser editadas ou excluídas logicamente pelo autor; criação, edição e exclusão possuem trilha de auditoria. Duplicidades, perfis não publicados, papéis incorretos e autoavaliação são bloqueados.
- A reputação aparece no perfil público e na busca, que agora pode ser ordenada pela média e quantidade de avaliações. A central da conta e todos os novos textos são bilíngues.
- Validada com 138 testes, build do Wrangler, CI, smoke HTTP local e smoke de produção. A migration remota `0007_reviews_and_reputation.sql` foi aplicada.
- Versão `23d2a343-7bdf-4c86-b75f-482051ff514b` publicada e validada com health check, página de busca e ordenação por reputação respondendo `200`.
- Risco residual: a estrutura de auditoria contempla moderação, mas a operação administrativa depende da futura definição de um papel de moderador e do fluxo de contestação.

### Fase 3.2 — concluída
- Integrada pelo PR #47 com a rota canônica `/fotografo/:slug`, SSR leve no Worker e conteúdo essencial obtido somente de perfis publicados no D1.
- O HTML de origem inclui título, descrição, canonical, Open Graph e JSON-LD `ProfilePage`/`Person`; a URL legada redireciona com `301` e perfis indisponíveis respondem `404` com `noindex`.
- A hidratação no navegador, os links da busca e da central da conta foram adaptados à URL amigável, preservando compatibilidade com o formato legado.
- O smoke de produção detectou corpo HTML vazio no primeiro deploy. O PR #48 corrigiu a leitura do template pelo binding ASSETS com uma requisição `GET` explícita.
- Validada com 146 testes, build do Wrangler, CI obrigatório, reprodução local e smoke de produção somente leitura.
- Versão `4346265f-e8b3-4c1e-b1c8-11ae43e8ce8d` publicada e validada com health check `200`, perfil indexável `200`, redirecionamento `301` e perfil ausente `404`.
- Nenhuma migration ou dado do D1 foi alterado.

### Fase 3.3 — concluída
- O PR #50 adicionou a migration `0008_conversations_and_messages.sql`, uma conversa por par cliente/fotógrafo, histórico paginado, mensagens não lidas, marcação de leitura e cinco contratos autenticados.
- A API restringe o conteúdo aos participantes, permite início somente por clientes em perfis publicados, usa consultas parametrizadas, batch atômico, limite de 2.000 caracteres e rate limiting.
- O PR #51 adicionou início de conversa no perfil público e inbox bilíngue na central da conta, com layout responsivo, paginação, resposta, contador de não lidas e link para o fotógrafo.
- A revisão visual real em desktop/mobile corrigiu a semântica dos botões da inbox e a reformatação de datas na troca PT/EN; o console permaneceu sem erros.
- Validada com 154 testes, build do Wrangler, CI obrigatório e smoke de produção somente leitura.
- Versão `08aad6f9-b22b-4680-949d-279076e120e2` publicada; health, assets e páginas responderam `200`, e endpoints privados sem sessão responderam `401`.
- Notificações externas, moderação administrativa e encerramento manual de conversas permanecem como evoluções futuras; não bloqueiam o chat persistente atual.

### Fase 3.4 — concluída
- O PR #53 adicionou `/sitemap.xml` dinâmico, limitado a perfis publicados de fotógrafos, e `/robots.txt` com diretivas de rastreamento e referência ao sitemap.
- O sitemap inclui as rotas públicas estáveis e `<lastmod>` derivado do D1; ambas as rotas aceitam `GET` e `HEAD`, com cache público de 1 hora e normalização de observabilidade.
- O smoke de produção encontrou uma ambiguidade SQL e, depois, uma coluna inexistente. Os PRs #54 e #55 corrigiram esses defeitos com consultas qualificadas e ordenação pelo `user_id` existente.
- Validada com 157 testes, build do Wrangler, CI obrigatório e smoke de produção somente leitura: sitemap `200` com 3 URLs publicadas, robots `200` com bloqueio de `/api/` e health `200`.
- Versão final `09def67b-f875-4384-9805-e839a7a718f7` publicada em produção, sem alteração de migration ou dados do D1.
- Limite residual: o sitemap atual atende até 50.000 URLs; se o catálogo crescer além desse limite, será necessário adotar sitemap index.

### Fase 4.1 — concluída
- O PR #57 adicionou cache de edge via `caches.default` para `GET /api/photographers` e `GET /api/photographers/:slug`, usando a URL completa como chave para separar filtros e perfis.
- Somente respostas `200` públicas, sem `Set-Cookie`, `private` ou `no-store`, são armazenadas; respostas `HEAD`, mutações, sessões e imagens privadas permanecem fora do cache.
- O TTL de 60 segundos reaproveita o `Cache-Control` já emitido pela API, limita defasagem de dados e evita invalidadores frágeis; falhas do cache degradam silenciosamente para o D1.
- Validada com 159 testes, build do Wrangler, CI obrigatório e smoke de produção somente leitura: duas buscas `200`, `Cache-Control: public, max-age=60` e segunda resposta com `CF-Cache-Status: HIT`.
- Versão `9f33b94f-92bf-439b-b4b1-465fdee65cc5` publicada em produção; nenhuma migration ou dado do D1 foi alterado.

### Fase 4.2 — concluída
- O PR #59 extraiu cadastro, login, logout, sessão atual e recuperação de senha para `src/auth.mjs`.
- O módulo recebe dependências explicitamente, sem estado mutável por requisição; roteamento, contratos HTTP, sessões e políticas de segurança foram preservados.
- Validada com 159 testes, build do Wrangler, CI obrigatório e smoke de produção: health `200` e sessão anônima `401`.
- Versão `44b195dd-c36a-41c1-b1a4-4118e3684948` publicada em produção; nenhuma migration ou dado do D1 foi alterado.
- O PR #61 extraiu listagem e detalhe públicos de fotógrafos para `src/photographers.mjs`, preservando filtros, paginação, portfólio, cache e contratos HTTP.
- Validada com 159 testes, build do Wrangler, CI obrigatório e smoke de produção: health `200` e busca pública `200`.
- Versão `7c8d6917-a36b-42aa-9287-5d6eef812fcc` publicada em produção; nenhuma migration ou dado do D1 foi alterado.
- O PR #63 extraiu foto de perfil, imagem de portfólio e avaliações públicas para `src/photographers.mjs`, concluindo as leituras públicas do domínio.
- Validada com 159 testes, build do Wrangler, CI obrigatório e smoke de produção: health, listagem, detalhe e avaliações com `200`.
- Versão `74e839d7-869d-4f41-aa34-534a60f1da58` publicada em produção; nenhuma migration ou dado do D1 foi alterado.
- As entregas seguintes concluíram a extração: leituras e mutações de fotógrafos (perfil profissional, review-requests, avaliações e conversas), entradas públicas, listing e mutações de portfolio, e segurança da conta (#76, #77).
- O PR #82 removeu os 22 blocos `if (false && ...)` herdados das extrações e realinhou três suítes que assertavam sobre o texto do `worker.mjs` para os módulos donos; `worker.mjs` ficou com 782 linhas, sem nenhuma mudança de contrato.
- Validação final: 159 testes aprovados, build do Wrangler e CI obrigatório; nenhuma migration ou dado do D1 foi alterado.

### Fase 4.3 — concluída
- A estratégia adotada foi transformação on-demand via binding `IMAGES` (Cloudflare Images) em vez do pipeline de variantes no upload previsto no roadmap — formalizada como Decisão 15 em `docs/DECISOES_TECNICAS.md`.
- Os PRs #78, #79 e #80 adicionaram a transformação responsiva das imagens de portfólio (`?width=` em 320/640/1280, AVIF/WebP quality 82), integraram o `srcset`/`sizes` na galeria e na central da conta e finalizaram a política de cache (`stale-while-revalidate` + `Vary: Accept`).
- O PR #84 estendeu as variantes às fotos de perfil (`GET /api/photographers/:slug/photo` e `GET /api/profile-picture/:id`), adicionou `srcset`/`sizes` ao avatar do perfil público e aos cards da busca e centralizou o helper duplicado em `src/images.mjs`.
- A invalidação de variantes é resolvida por versionamento de URL (`?v=updated_at`), sem purge.
- Validada com 160 testes, build do Wrangler e CI obrigatório; nenhuma migration ou dado do D1 foi alterado.
- Versão `e271e165-8768-461d-a746-f3b66587b4c5` publicada em produção em 1º de setembro de 2026 (2 assets atualizados: `search.js` e `photographer-profile.js`; binding `IMAGES` confirmado ativo). Smoke somente leitura: health `200`, home `200`, sitemap `200` com 3 URLs, busca `200` (1 perfil) e rotas de foto respondendo `404` corretamente para perfil sem foto, com e sem `?width=640`. A transformação on-demand não pôde ser exercitada com dados reais (nenhum fotógrafo publicado com foto) e permanece coberta pela suíte automatizada.

### Fase 4.4 — concluída (disponibilidade, P95 e 5xx in-worker)
- O sinal de disponibilidade (>= 99,9%) é coberto por sonda in-worker: cron a cada 5 min (`scheduled` handler) executa a checagem D1 idêntica ao `GET /api/health`; após 2 falhas consecutivas envia e-mail operacional via Brevo (janela, rota, valor observado, runbook em `docs/OBSERVABILIDADE.md`), com cooldown de 1h e estado durável na tabela `monitor_state` (migration `0009`).
- Os sinais de latência P95 (< 300 ms) e taxa de 5xx (< 0,1%) também são agregados pelo Worker e avaliados pelo cron a cada 5 minutos, com alertas Brevo e cooldown por sinal (PR #95, migration `0010`).
- A disponibilidade foi publicada na versão `51d056b4`; P95 e 5xx foram publicados na versão `9c72c288` em 3 de setembro de 2026. Contratos e operação estão em `docs/OBSERVABILIDADE.md`.

### Fase 5.2.a — concluída (backup remoto operacional)
- O workflow diário exporta o D1 remoto e envia o arquivo com `--remote` ao bucket privado `lensclick-backups`, sob `daily/`; o PR #98 corrigiu a localização do upload e o PR #99 tornou a retenção robusta e adicionou confirmação explícita da existência remota.
- Evidência: execução manual [33883526187](https://github.com/Renato1909/LensClick/actions/runs/33883526187), em 4 de setembro de 2026, aprovada integralmente. O D1 e o R2 registraram `Resource location: remote`, o objeto `daily/backup-20260904T142433Z.sql` foi confirmado pela API com 15.662 bytes e a retenção de 30 dias foi aplicada.
- A política foi formalizada na Decisão 16 (5.2.c). Em 18 de setembro de 2026, o backup `backup-20260918T081321Z.sql` foi restaurado exclusivamente em D1 local isolado: 15 tabelas de negócio, integridade `ok` e 0 violações de chave estrangeira. Nenhum registro pessoal foi exibido; produção permaneceu intocada e os artefatos temporários foram removidos. A iniciativa 5.2 está concluída.

### Fase 5.3 — concluída (segurança transversal)
- O PR #104 ativou HSTS por dois anos com `includeSubDomains` e sem `preload`, removeu `'unsafe-inline'` de `script-src` e externalizou os scripts das cinco páginas afetadas.
- Respostas do Worker usam `SECURITY_HEADERS`; assets estáticos recebem a mesma política por `public/_headers`, evitando invocações adicionais apenas para aplicar cabeçalhos.
- O PR #105 limitou cada usuário a cinco sessões ativas. A sessão recém-criada é preservada e a inserção/remoção de excedentes ocorre em batch atômico no D1, sem migration.
- Os dois PRs passaram pelo check obrigatório. A suíte final possui 185/185 testes aprovados e o build do Wrangler foi validado.
- A versão `0b72f0b4-b525-4b20-bdc3-f474574851bd` foi publicada em 18 de setembro de 2026. Smoke somente leitura confirmou páginas e scripts `200`, health/D1 `200`, sessão anônima `401`, rota desconhecida `404`, HSTS/CSP em todas as páginas críticas, tradução funcional e ausência de erros no console. Não houve rollback nem escrita no D1.
- A política foi formalizada na Decisão 17 de `docs/DECISOES_TECNICAS.md`.

### Fase 5.4.a — concluída (verificação de e-mail)
- O PR #108 criou a migration `0011` (`email_verification_tokens` + `users.email_verified_at`), as rotas `POST /api/auth/email/verify` e `POST /api/auth/email/resend`, a página `verificar-email.html` e 14 chaves `verify.*` em PT/EN.
- Decisão 18: login em modo de aviso — não bloqueia contas não verificadas; `publicUser` expõe `emailVerified`.
- Versão `18f14b0f-cd05-4c48-9bea-4a88efb54f08` publicada em 18 de setembro de 2026 com 193/193 testes e smoke de produção aprovado.

### Fase 5.4.b — concluída (papel administrativo)
- O PR #109 criou a migration `0012` (`users.is_admin`), o módulo `src/admin.mjs` com `requireAdmin` (401/403) aplicado a toda rota `admin.*`, e `GET /api/admin/overview` como base de leitura do painel.
- Decisão 19: primeiro admin somente por SQL pontual; nenhum endpoint de promoção; `publicUser` expõe `isAdmin`.
- Versão `f046a3dc-ef72-402b-b774-7bf0aa5441e5` publicada em 18 de setembro de 2026 com 197/197 testes e smoke de produção aprovado. Conta oficial `lensclick.fotografias@gmail.com` promovida a administradora verificada por SQL pontual.

### Fase 5.4.c — concluída (painel de moderação)
- O PR #111 criou `GET /api/admin/reviews` + `PUT /api/admin/reviews/:id` (moderate/restore com trilha em `review_audit`), `GET /api/admin/conversations` + `PUT /api/admin/conversations/:id` (close/reopen; encerrada bloqueia mensagens com `409`) e o painel `public/admin.html` + `admin.js` com 21 chaves `admin.*` em PT/EN.
- A política foi formalizada na Decisão 20 de `docs/DECISOES_TECNICAS.md`. A Fase 5.4 está encerrada.
- Versão `63108ee4-f69a-4933-aa2a-19772010e9d7` publicada em 18 de setembro de 2026 com 203/203 testes e smoke de produção aprovado. Nenhuma migration ou dado do D1 foi alterado.

### P4 — SEO e presença (médio prazo, baixo risco)
- Open Graph, Twitter Cards e JSON-LD nas páginas públicas estáticas — evoluídos no PR #145 a partir do que a 5.8.b entregou: `og:image` em todas as páginas, JSON-LD por tipo (`WebSite` + `Organization` + `WebPage` na home, `CollectionPage` na busca, `WebPage` nas legais), `noindex` nas páginas de autenticação e canonical derivado do host sem query string; perfis SSR mantêm metadados específicos desde a Fase 3.2.
- Cache via `caches.default` para buscas e perfis públicos — concluído na Fase 4.1.
- Domínio próprio, DNS e remetente Brevo no domínio — pendente (5.8.c).

### P5 — Segurança (médio/longo prazo, alto risco)
- Verificação de e-mail no cadastro — concluída em 5.4.a, atualmente em modo de aviso.
- 2FA opcional — pendente e próximo tema de avaliação, sem implementação iniciada.
- Autorização por papel (roles) — resolvida operacionalmente: `is_admin` + `requireAdmin` (5.4.b) e painel de moderação (5.4.c) ativos.
- Revisão legal formal de termos e política (divulgações LGPD de alta prioridade — PR #89 — e itens de média prioridade — PR #91 — já implementados).

### P6 — Aplicativo Android e lançamento multicliente
- Incorporar e versionar o projeto Kotlin criado no Android Studio; decidir monorepo ou repositório próprio.
- Criar a matriz web/API/Android e implementar somente diferenças classificadas e aprovadas.
- Definir autenticação móvel segura e 2FA como política única de conta para web e Android.
- Validar release em testes locais, instrumentados, emuladores, telefone e tablet.
- Publicar por faixas na Google Play somente após domínio, revisão jurídica e gates técnicos.
- Seguir `docs/PLANO_ANDROID_VALIDACAO_PUBLICACAO.md` como plano operacional.

### Fases 5 e 6 — encerramento web e convergência Android

Levantamento concluído em 3 de setembro de 2026, com `main` em `86d3c3f`, a partir da leitura cruzada de HANDOFF, AI_CONTEXT, CONTEXTO_PROJETO e do código em `src/`, `migrations/`, `public/` e `wrangler.jsonc`.

| Ordem | Iniciativa | Complexidade | Estado |
|---:|---|:---:|---|
| 17 | 5.1 Consolidação documental | Baixa | Concluída |
| 18 | 5.2 Backup e restauração do D1 | Média | Concluída |
| 19 | 5.3 Endurecimento transversal de segurança | Média | Concluída |
| 20 | 5.4 Verificação de e-mail e papéis de autorização | Alta | Concluída |
| 21 | 5.5 Portabilidade de dados do titular (LGPD) | Baixa | Parcial — revisão legal pendente |
| 22 | 5.6 Automação da entrega | Média | Concluída |
| 23 | 5.7 Qualidade e débitos técnicos | Média | Concluída |
| 24 | 5.8 Produto e presença digital | Média | Parcial — domínio/DNS/e-mail pendentes |
| 25 | 6.1 Fonte de verdade e diagnóstico Android | Média | Não iniciada — projeto Kotlin ainda externo |
| 26 | 6.2 Contrato móvel e paridade funcional | Alta | Não iniciada |
| 27 | 6.3 Autenticação em duas etapas multicliente | Alta | Planejada |
| 28 | 6.4 Validação integral web/API/Android | Alta | Planejada |
| 29 | 6.5 Publicação Android na Google Play | Média | Não iniciada |
| 30 | 6.6 Domínio, e-mail e revisão jurídica | Média | Pendente — gate de lançamento |

---

## 8. Ordem recomendada de execução

```
1. [6.1] Disponibilizar, versionar e diagnosticar o projeto Android Studio em Kotlin.
2. [6.1] Criar a matriz de paridade web/API/Android e aprovar o escopo do primeiro lançamento.
3. [6.2] Definir o contrato móvel seguro e implementar paridade por fatias.
4. [5.8.c/6.6] Escolher o domínio e configurar Cloudflare, DNS e remetente Brevo.
5. [5.5.b/6.6] Conduzir a revisão jurídica formal em paralelo, concluindo-a antes do lançamento comercial.
6. [6.3] Implementar o 2FA para web e Android conforme o ADR 002 (Proposto): o threat model e a decisão técnica já estão prontos; falta a aprovação do mantenedor, a migration `0015_two_factor.sql` e o slice de implementação.
7. [6.4] Executar a validação integral e corrigir todos os achados críticos/altos.
8. [6.5] Publicar na faixa interna, teste fechado e lançamento gradual da Google Play.
```

**Justificativa da ordem:**
- O catálogo `db/schema.ts` já foi sincronizado pelo PR #20 e a observabilidade foi validada antes da integração.
- A iniciativa 1.2 criou a cobertura de regressão necessária antes das mudanças de rate limiting e health check.
- A iniciativa 1.3 foi concluída com uma arquitetura híbrida e rollback documentado.
- A iniciativa 1.4 foi concluída com migration remota, health check e smoke test de produção; a Fase 1 está encerrada.
- O marco estrutural do roteador, as quatro iniciativas da Fase 2 e as iniciativas 3.1–3.4 foram concluídos e validados em produção.
- A Fase 3.4 complementou os perfis indexáveis com descoberta automatizada por sitemap e diretivas explícitas para crawlers.
- A Fase 4.1 passou a aproveitar o cache da edge para leituras públicas.
- A Fase 4.2 foi concluída: todos os handlers de domínio foram extraídos e os blocos legados removidos no PR #82.
- A Fase 4.3 foi concluída com transformação on-demand (Decisão 15) e publicada em produção na versão `e271e165`.
- A Fase 4.4 foi concluída: além da sonda de disponibilidade (versão `51d056b4`), os sinais de P95 e taxa de 5xx passaram a ser cobertos in-worker pelo PR #95, publicado na versão `9c72c288` em 3 de setembro de 2026.
- A consolidação documental 5.1 foi concluída; `db/schema.ts` está atualmente na versão 14 com 16 tabelas, após a migration `0014_sessions_kind.sql` (ADR 001, separação web/móvel das sessões). O catálogo é verificado contra as migrations publicadas pelo teste `o catalogo db/schema.ts esta em sintonia com as migrations publicadas`.
- A iniciativa 5.2 foi concluída integralmente: backup remoto, política formal e restore isolado validados. A dependência crítica da 5.6 está atendida.
- A iniciativa 5.3 foi concluída: HSTS e CSP foram validados nas respostas públicas, e o teto de cinco sessões foi coberto por testes de isolamento entre usuários.
- As iniciativas 5.4.a (verificação de e-mail, Decisão 18), 5.4.b (papel administrativo, Decisão 19) e 5.4.c (painel de moderação, Decisão 20) foram concluídas e publicadas. A 5.5.a foi concluída pelo PR #113; a 5.5.b continua pendente por ser revisão legal externa. A 5.6 foi concluída pelos PRs #114/#115, a 5.7 pelos PRs #116/#117 e a 5.8.a/b pelo PR #119. Restam na Fase 5 apenas a revisão jurídica 5.5.b e a configuração de domínio, DNS e e-mail 5.8.c; a próxima iniciativa técnica planejada é a Fase 6.

---

## 9. Observações importantes para quem continuar

### Ambiente (Windows)

- **Caminho canônico:** `D:/LensClick - Recomeço` — clone Git completo e único working tree do projeto.
- **`safe.directory` ao mover a pasta:** se o git reportar `fatal: detected dubious ownership` (típico após mover/copiar o repositório), registrar o caminho atual:
  ```
  git config --global --add safe.directory 'D:/LensClick - Recomeço'
  ```
  > `safe.directory` só é lido da configuração **global** (um repositório não pode se autoautorizar). Alternativa sem gravar nada no `C:`: definir, apenas na sessão do PowerShell, `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=safe.directory` e `GIT_CONFIG_VALUE_0=D:/LensClick - Recomeço`.
- **Node.js no D:** o runtime é a distribuição portable oficial em `D:\nodejs` (v24.22.0, LTS "Krypton"), já incluída no PATH do usuário. O cache e o prefixo globais do npm apontam para `D:\npm-cache` e `D:\nodejs`, de modo que o toolchain não grava nada no `C:`. No PowerShell use `npm.cmd` — o `npm.ps1` é bloqueado pela ExecutionPolicy do Windows.
- **PowerShell, não bash:** este ambiente usa PowerShell 5.1. Sintaxe bash (loops `for`, `&&`) não funciona. Usar `foreach`, `;` para encadear, e `Select-Object`/`Where-Object` em vez de pipes unix.
- **Auth do git remoto:** o `gh` está autenticado via keyring nesta máquina e push/pull/PR via HTTPS funcionam (validado em 01/09/2026 no fluxo do PR #82).

### Disco do toolchain: tudo no D:, nada no C:

O projeto, o clone Git, as dependências e o toolchain vivem no **disco D: (HDD)**. O **C: (SSD) não recebe escrita do fluxo de trabalho do projeto**. Isso é garantido por variáveis de ambiente de usuário, aplicadas por `scripts/env-local.ps1` (idempotente, reexecutável):

| Variável | Valor | O que evita no C: |
|---|---|---|
| `NPM_CONFIG_CACHE` | `D:\npm-cache` | Cache de download do npm (já eram ~197 MB) |
| `NPM_CONFIG_PREFIX` | `D:\nodejs` | Instalação global de pacotes |
| `TEMP` / `TMP` | `D:\temp` | Temporários de node, esbuild, wrangler e Playwright |
| `PLAYWRIGHT_BROWSERS_PATH` | `D:\playwright-browsers` | Chromium e ffmpeg do Playwright (~600 MB se instalados) |
| `XDG_DATA_HOME` | `D:\opencode\data` | Sessões, banco e logs do OpenCode |
| `XDG_CONFIG_HOME` | `D:\opencode\config` | Config do OpenCode **e os logs do wrangler** (grava em `%APPDATA%\xdg.config\.wrangler\logs`) |
| `XDG_STATE_HOME` | `D:\opencode\state` | Registro do serviço em background |
| `XDG_CACHE_HOME` | `D:\opencode\cache` | Cache do OpenCode |
| `GIT_CONFIG_GLOBAL` | `D:\gitconf\config` | `.gitconfig` global (com `user.name`, `user.email` e `safe.directory`) |

Regras práticas:

- **Node.js é a distribuição portable** em `D:\nodejs` (v24.22.0), no PATH do usuário. Não há instalação do Node no C:.
- **No PowerShell, use `npm.cmd`** — o `npm.ps1` é bloqueado pela ExecutionPolicy do Windows.
- **Os `XDG_*` só podem ser apontados para o D: depois que os dados tiverem sido migrados.** Apontá-los antes faria o OpenCode iniciar com um banco vazio e perder as sessões. O `scripts/env-local.ps1` detecta isso e se recusa a alterá-los enquanto a migração não tiver acontecido.
- A migração dos dados do OpenCode é feita por `D:\opencode\opencode-migrate.ps1`, que exige o app fechado: ele move as pastas, define as variáveis na ordem correta, verifica com `opencode debug paths` e só então reloca o `userData` do app desktop.
- O binário do Node no Windows tem limite de stack pequeno e o `workerd` **não roda localmente** (access violation `0xc0000005` no startup), então o preview local e os E2E dependem do CI (ubuntu-latest) ou de WSL/Docker. Ver `docs/DEPENDENCIAS_E_SEGURANCA.md`, risco residual R2.

### Convenções do projeto

- **Migrações imutáveis** — nunca editar `0001`–`0014`. Nova alteração de schema = novo arquivo `0015_*.sql`.
- **Fast-forward only** — `main` não aceita merge commits. Todo PR é squash-mergeado.
- **Status check obrigatório** — o CI "Qualidade" precisa passar antes do merge. Rodar `npm test` e `npm run check` localmente antes de abrir PR.
- **Auditoria de dependências** — rodar `npm audit` antes de abrir PR que toque `package.json` ou `package-lock.json`, e nunca editar o lockfile à mão. O gate do job diário é bloqueante; o do CI de PR é informativo. Política em `docs/DEPENDENCIAS_E_SEGURANCA.md`.
- **i18n** — toda string visível ao usuário deve passar por `window.i18n`; cada chave precisa existir em `public/locales/pt-BR.json` e `public/locales/en-US.json`. Não hardcoded em PT ou EN.
- **Design tokens** — usar variáveis `--lc-*` de `public/refinements.css`. Não introduzir cores/espaçamentos hardcoded.
- **R2 privado** — imagens nunca são públicas; sempre servidas via Worker com validação de sessão quando aplicável.

### Hotspots de conflito

- `src/worker.mjs` — ponto de composição compartilhado; mudanças transversais ainda podem concentrar conflitos. Handlers de domínio devem permanecer nos módulos dedicados.
- `public/locales/pt-BR.json` e `public/locales/en-US.json` — toda feature de UI adiciona chaves equivalentes nos dois arquivos. Mesma recomendação.

### Documentação de referência

- `docs/CONTEXTO_PROJETO.md` — onboarding permanente (fonte primária deste handoff).
- `docs/ROADMAP_EVOLUCAO.md` — plano de evolução técnica (Fases 1 a 4 concluídas; Fase 5 em execução, com 5.1, 5.2, 5.3 e 5.4 concluídas).
- `docs/OBSERVABILIDADE.md` — contrato dos eventos, privacidade, consultas, evidências e rollback da iniciativa 1.1.
- `docs/RATE_LIMITING.md` - arquitetura híbrida, políticas, evidências de produção e rollback da iniciativa 1.3.
- `docs/DEPENDENCIAS_E_SEGURANCA.md` - superfície de dependências, avaliação de risco do toolchain, gate `npm audit` no CI, evidências e rollback.
- `docs/D1_HEALTH.md` — contrato do health check, índices, operação, evidências e rollback da iniciativa 1.4.
- `docs/BACKUP_D1.md` — backup diário do D1 no R2, procedimento de restauração e validação periódica (iniciativa 5.2).
- `docs/PLANO_ANDROID_VALIDACAO_PUBLICACAO.md` — gates de incorporação, paridade, 2FA, validação, domínio, jurídico e Google Play (Fase 6).
- `docs/DOCUMENTACAO_TECNICA.md` — documentação técnica detalhada.
- `DESIGN_SYSTEM.md` — guia de design e tokens.
- `CONTRIBUTING.md` — fluxo de contribuição.
- `CLOUDFLARE_SETUP.md` — configuração do Cloudflare (D1, R2, Workers).

### Agentes Copilot disponíveis (`.github/agents/`)

Arquiteto de Software · Designer · Engenheiro Backend · Engenheiro Frontend · Engenheiro de Banco de Dados · Engenheiro DevOps · Engenheiro de QA · Especialista em Segurança · Especialista em SEO e Performance · Especialista em Marketing para Fotografia · Revisor de Código — 11 agentes definidos em `.github/agents/`. (O Explore citado em versões anteriores deste documento é agente nativo do Copilot, não um `.agent.md` do projeto.)

Use-os para delegar tarefas especializadas durante o desenvolvimento.

---

**Última atualização deste handoff:** 21 de outubro de 2026, com base `main` em `d22b1e0` (PR #138); Fase 5 encerrada com os gates externos (revisão legal formal e domínio próprio) pendentes; Fase 6 em planejamento — contrato de autenticação móvel publicado no ADR 001, 2FA projetado no ADR 002 (Proposto, sem implementação), agentes portados para o OpenCode (#134 a #136) e iniciativa A2 de performance concluída (#137); convergência web/Android, validação integral e publicação Google Play continuam pendentes.
