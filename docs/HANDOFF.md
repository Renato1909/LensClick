# HANDOFF — LensClick

> Documento de transferência do projeto. Representa o estado atual e serve como guia para quem assumir o desenvolvimento a partir de agora.
>
> **Data de referência:** 19 de setembro de 2026, com a base `main` em `eea0009` (PR #119 mergeado e publicado).
> **Fonte primária:** `docs/CONTEXTO_PROJETO.md` + estado ao vivo do git.
> **Estado do roadmap:** Fase 1, marco de transição, Fase 2, iniciativas 3.1–3.4 e Fases 4.1 a 4.4 concluídas. Na **Fase 5**, as iniciativas 5.1, 5.2, 5.3, 5.4, 5.6 e 5.7 estão concluídas. A 5.5 está parcial: 5.5.a (exportação LGPD) concluída e 5.5.b (revisão legal formal) pendente por ser atividade externa. A **5.8 — Produto e presença digital** está parcial: 5.8.a e 5.8.b concluídas e publicadas; resta a 5.8.c, que depende de domínio próprio, DNS e remetente Brevo (atividade externa).

---

## 1. Situação atual da main

- **Base da entrega:** `main` → commit `8a3a66f` — "docs: sync HANDOFF to base 9252f9c with PRs 120-122" (#123).
- **Working tree após a integração:** limpa e sincronizada com `origin/main`; branch da iniciativa removida local e remotamente.
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
| Banco de dados | D1 `lensclick-db` (SQLite) — 15 tabelas |
| Armazenamento de imagens | R2 `lensclick-profile-images` (bucket privado) |
| Assets estáticos | Workers Assets (`public/`) |
| E-mail transacional | Brevo |
| Senhas | Web Crypto — PBKDF2-SHA-256, 100k iterações |
| Frontend | HTML/CSS/JS vanilla, sem framework |
| i18n | Catálogos `public/locales/` + runtime `public/lang.js` (`window.i18n`) — PT-BR/EN-US |
| UX | `public/ux.js` (`window.LensClickUX`) |
| Design tokens | `public/refinements.css` (prefixo `--lc-*`) |
| Testes | Node.js test runner (`node --test`) — execute `npm test` para consultar o total atual |
| Node | >=22.13.0 |
| Wrangler | ^4.0.0 (única devDep) |

### Scripts disponíveis (`package.json`)

- `npm start` — sobe o Worker local (porta 4174; `prestart` roda `db:migrate:local`).
- `npm run dev` — modo watch.
- `npm run check` — `wrangler deploy --dry-run` (valida build sem publicar).
- `npm test` — `node --test`.
- `npm run test:smoke` — smoke HTTP (`scripts/http-smoke.mjs`).
- `npm run db:migrate:local` / `db:migrate:remote` — aplica migrações D1.

### Tabelas D1 (15)

`users`, `sessions`, `password_reset_tokens`, `email_verification_tokens`, `contact_messages`, `newsletter_subscriptions`, `rate_limits`, `professional_profiles`, `portfolio_items`, `review_requests`, `reviews`, `review_audit`, `conversations`, `messages`, `monitor_state`, `monitor_minute_buckets`.

### Migrações publicadas (13)

`0001_initial.sql` … `0010_monitor_minute_buckets.sql`, `0011_email_verification.sql`, `0012_admin_role.sql`, `0013_portfolio_cover_category.sql`.

> ⚠️ **Regra de ouro:** nunca editar migrações já publicadas. Criar nova `0014_*.sql` para qualquer alteração de schema.

---

## 2. Branches atuais

- **Branches locais permanentes:** `main` e `codex/preserved-local-main-20260905` (histórico local preservado; não contém trabalho a integrar).
- **Branches remotas:** somente `origin/main` (além do ponteiro simbólico `origin/HEAD -> origin/main`).
- **Branches sem upstream:** nenhuma.
- **Trabalho pendente em branches:** nenhum.

A limpeza controlada foi concluída após comparar a árvore de cada branch obsoleta com o commit squash correspondente em `main`. As duas branches locais que estavam órfãs também apresentaram conteúdo idêntico aos PRs #2 e #3 já incorporados; nenhum trabalho exclusivo foi removido.

---

## 3. Funcionalidades em desenvolvimento

A iniciativa 5.1 está em entrega documental; não há funcionalidade de produto em desenvolvimento. As quatro iniciativas da Fase 1, o marco de transição, a Fase 4.2, a Fase 4.3 e a Fase 4.4 estão integrados e publicados em produção. O catálogo e o despacho HTTP ficam em `src/router.mjs`; os handlers de domínio vivem em módulos próprios (`src/auth.mjs`, `photographers.mjs`, `account.mjs`, `account-security.mjs`, `portfolio.mjs`, `public-input.mjs`, `monitoring.mjs`) e a instrumentação compartilhada fica em `observability.mjs`; o `worker.mjs` permanece como ponto de composição. As funcionalidades de produto abaixo já estão em `main` e em produção:

### Funcionalidades entregues

- **Landing page** (`public/index.html`) — redesign editorial premium, hero com CTA para busca.
- **Cadastro e login** — autenticação com PBKDF2, sessões em D1.
- **Recuperação de senha** — fluxo via Brevo com tokens de uso único (`password_reset_tokens`).
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
- **Perfis indexáveis** — rota `/fotografo/:slug` com SSR, canonical, Open Graph e JSON-LD (Fase 3.2).
- **Sitemap e robots** — gerados dinamicamente a partir dos perfis publicados (Fase 3.4).
- **Observabilidade e alertas** — logs estruturados com `X-Request-ID`, SLOs definidos e sondas in-worker de disponibilidade, P95 e taxa de 5xx (Fases 1.1 e 4.4).
- **Bilíngue PT-BR/EN-US** — catálogos JSON separados, fallback progressivo e runtime `public/lang.js` com `window.i18n`.
- **Header redesign** — botão de busca responsivo.
- **Redesign editorial** — textura de fundo premium.

### Não implementado / pendente

- 5.8.c: domínio próprio, DNS e remetente Brevo no domínio.
- 5.5.b: revisão legal formal dos Termos de Uso e da Política de Privacidade.
- 2FA continua fora do escopo atual.
- O rate limiting permanece deliberadamente híbrido: escudo de rajada nativo na edge e políticas longas autoritativas no D1.
- A suíte de contratos cobre as 40 rotas e os 45 contratos HTTP catalogados; apenas os 3 fluxos críticos têm cobertura em navegador real, e testes ponta a ponta com serviços reais permanecem fora do escopo atual.
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
| #101 | — | docs: formaliza backup do D1 como Decisão 16 (5.2.c) |
| #102 | `0c3253b` | docs: conclude phase 5.1 consolidation |
| #103 | `e906b14` | docs: record isolated D1 restore validation |
| #104 | `8305f38` | security: enforce HSTS and strict script CSP |
| #105 | `546b132` | security: limit active account sessions |
| #106 | `24ed0ad` | docs: conclude phase 5.3 security hardening |
| #107 | `ae57a98` | docs: fix HANDOFF base to 62857da with PR 106 |
| #108 | `3a1a3b5` | feat(auth): email verification with warn-only login (5.4.a) |
| #109 | `bf430d5` | feat(auth): admin role with requireAdmin guard (5.4.b) |
| #110 | `5ee3f1e` | docs: record 5.4.a and 5.4.b production rollout |
| #111 | `1ed173d` | feat(admin): moderation panel for reviews and conversations (5.4.c) |
| #112 | `192d4c3` | docs: record 5.4.c production rollout and close Phase 5.4 |
| #113 | `b59a681` | feat(account): titular data export for LGPD portability (5.5.a) |
| #114 | `8dd9e66` | feat(ci): local preview with smoke and automated production deploy (5.6) |
| #115 | `6c02df8` | fix(ci): fail fast when token lacks Workers deploy access |
| #116 | `7b0f228` | feat(quality): single-source tokens, frontend lint and real-browser e2e (5.7) |
| #117 | `775eafa` | fix(e2e): prevent professional profile loading race |
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
- **Brevo** como provedor de e-mail transacional (recuperação de senha).
- **Migrações imutáveis** — regra estabelecida: nunca editar migração publicada.
- **Contratos por rota** — a iniciativa 1.2 consolidou infraestrutura compartilhada de testes e cobriu os 21 padrões de rota e 24 contratos HTTP catalogados, sem alterar código de produção.
- **Rate limiting híbrido** — a iniciativa 1.3 adicionou quatro bindings nativos de 60 segundos como escudo de rajada e preservou as políticas longas no D1 como camada autoritativa e fallback.
- **Health check mínimo e seguro** — `GET /api/health` executa `SELECT 1` no D1, retorna somente estado genérico e não consulta o R2 para evitar operações artificiais.
- **Índices orientados pelas consultas reais** — a migration `0005` adicionou índices para listagem, estado e disponibilidade; o índice explícito redundante de `slug` foi removido, preservando o autoíndice da restrição `UNIQUE`.
- **Roteador declarativo extraído** — o PR #34 criou `src/router.mjs` com as 25 combinações HTTP catalogadas, preservando origem, parâmetros dinâmicos, respostas e entrega de assets.

---

## 6. Riscos conhecidos

### Críticos

1. **Sem 2FA / verificação de e-mail** — contas podem ser criadas com e-mail não verificado; risco de abuso e account takeover.
2. **Políticas longas ainda usam D1** — o escudo nativo protege rajadas, mas as janelas de 15 minutos e 1 hora continuam em `rate_limits`. A arquitetura é intencional e segura, porém ainda consome D1 nas rotas protegidas.
3. **Roles não autorizam áreas** — não há autorização por papel; qualquer usuário autenticado acessa as mesmas rotas.

### Técnicos

4. **Hotspots de conflito** — `src/worker.mjs` e os catálogos em `public/locales/` são tocados por muitas features. Alto risco de conflito de merge.
5. **Sem alertas e SLOs** — os logs estruturados existem, mas a detecção proativa pertence à Fase 4.
6. **Health check não cobre R2** — decisão deliberada para não gerar operações artificiais; indisponibilidade do bucket é detectada pelos eventos das rotas reais de imagem.
7. **SEO incompleto** — sitemap e robots já estão disponíveis; ainda faltam Open Graph e JSON-LD adicionais em páginas que não são perfis SSR. Impacta indexação e compartilhamento social.
8. **Cache de descoberta com TTL curto** — buscas e perfis públicos usam `caches.default` por 60 segundos; alterações podem permanecer stale por esse intervalo.

### Legais / Processo

9. **Termos e política em adequação progressiva** — as divulgações LGPD de alta prioridade da política de privacidade foram implementadas pelo PR #89 (base legal por tratamento — art. 7º; encarregado/DPO — art. 41; transferência internacional — art. 33; direito de reclamação à ANPD) e os itens de média prioridade pelo PR #91 (versão/data nos documentos, idade mínima e dados de menores — art. 14, conta e encerramento nos termos, foro e lei aplicável, prazos de retenção por categoria), ambos em produção. Restam: melhorias opcionais e a revisão legal formal antes da publicação comercial.

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
- Open Graph e JSON-LD nas páginas que não são SSR — nos perfis públicos já existem desde a Fase 3.2.
- Cache via `caches.default` para assets e respostas imutáveis.
- Domínio próprio e remetente Brevo no domínio.

### P5 — Segurança (médio/longo prazo, alto risco)
- Verificação de e-mail no cadastro.
- 2FA opcional.
- Autorização por papel (roles) — resolvida operacionalmente: `is_admin` + `requireAdmin` (5.4.b) e painel de moderação (5.4.c) ativos.
- Revisão legal formal de termos e política (divulgações LGPD de alta prioridade — PR #89 — e itens de média prioridade — PR #91 — já implementados).

### Fase 5 — em execução (registrada em `docs/ROADMAP_EVOLUCAO.md`)

Levantamento concluído em 3 de setembro de 2026, com `main` em `86d3c3f`, a partir da leitura cruzada de HANDOFF, AI_CONTEXT, CONTEXTO_PROJETO e do código em `src/`, `migrations/`, `public/` e `wrangler.jsonc`.

| Ordem | Iniciativa | Complexidade |
|---:|---|:---:|
| 17 | 5.1 Consolidação documental — concluída | Baixa |
| 18 | 5.2 Backup e restauração do D1 — concluída | Média |
| 19 | 5.3 Endurecimento transversal de segurança — concluída | Média |
| 20 | 5.4 Verificação de e-mail e papéis de autorização — concluída | Alta |
| 21 | 5.5 Portabilidade de dados do titular (LGPD) | Baixa | **Parcial** |
| 22 | 5.6 Automação da entrega | Média | **Concluída** |
| 23 | 5.7 Qualidade e débitos técnicos | Média | **Concluída** |
| 24 | 5.8 Produto e presença digital | Média | **Parcial (5.8.a e 5.8.b concluídas)** |

---

## 8. Ordem recomendada de execução

```
1. [5.5.b] Revisão legal formal — pendência externa e condição para publicação comercial.
2. [5.8] Produto e presença digital — próxima iniciativa de código.
3. Evoluções posteriores devem ser priorizadas conforme produto, segurança e métricas.
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
- A consolidação documental 5.1 foi concluída: `db/schema.ts` está na versão 12 com 16 tabelas, e as fontes permanentes refletem as decisões e o progresso do projeto.
- A iniciativa 5.2 foi concluída integralmente: backup remoto, política formal e restore isolado validados. A dependência crítica da 5.6 está atendida.
- A iniciativa 5.3 foi concluída: HSTS e CSP foram validados nas respostas públicas, e o teto de cinco sessões foi coberto por testes de isolamento entre usuários.
- As iniciativas 5.4.a (verificação de e-mail, Decisão 18), 5.4.b (papel administrativo, Decisão 19) e 5.4.c (painel de moderação, Decisão 20) foram concluídas e publicadas. A 5.5.a foi concluída pelo PR #113; a 5.5.b continua pendente por ser revisão legal externa. A 5.6 foi concluída pelos PRs #114/#115 e a 5.7 pelos PRs #116/#117. Portanto, a próxima iniciativa de código é a 5.8.

---

## 9. Observações importantes para quem continuar

### Ambiente (Windows)

- **`safe.directory` ao mover a pasta:** se o git reportar `fatal: detected dubious ownership` (típico após mover/copiar o repositório), registrar o caminho atual:
  ```
  git config --global --add safe.directory 'C:/Users/renat/Desktop/LensClick - Hoje'
  ```
- **PowerShell, não bash:** este ambiente usa PowerShell 5.1. Sintaxe bash (loops `for`, `&&`) não funciona. Usar `foreach`, `;` para encadear, e `Select-Object`/`Where-Object` em vez de pipes unix.
- **Auth do git remoto:** o `gh` está autenticado via keyring nesta máquina e push/pull/PR via HTTPS funcionam (validado em 01/09/2026 no fluxo do PR #82).

### Convenções do projeto

- **Migrações imutáveis** — nunca editar `0001`–`0013`. Nova alteração de schema = novo arquivo `0014_*.sql`.
- **Fast-forward only** — `main` não aceita merge commits. Todo PR é squash-mergeado.
- **Status check obrigatório** — o CI "Qualidade" precisa passar antes do merge. Rodar `npm test` e `npm run check` localmente antes de abrir PR.
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
- `docs/RATE_LIMITING.md` — arquitetura híbrida, políticas, evidências de produção e rollback da iniciativa 1.3.
- `docs/D1_HEALTH.md` — contrato do health check, índices, operação, evidências e rollback da iniciativa 1.4.
- `docs/BACKUP_D1.md` — backup diário do D1 no R2, procedimento de restauração e validação periódica (iniciativa 5.2).
- `docs/DOCUMENTACAO_TECNICA.md` — documentação técnica detalhada.
- `DESIGN_SYSTEM.md` — guia de design e tokens.
- `CONTRIBUTING.md` — fluxo de contribuição.
- `CLOUDFLARE_SETUP.md` — configuração do Cloudflare (D1, R2, Workers).

### Agentes Copilot disponíveis (`.github/agents/`)

Arquiteto de Software · Designer · Engenheiro Backend · Engenheiro Frontend · Engenheiro de Banco de Dados · Engenheiro DevOps · Engenheiro de QA · Especialista em Segurança · Especialista em SEO e Performance · Especialista em Marketing para Fotografia · Revisor de Código — 11 agentes definidos em `.github/agents/`. (O Explore citado em versões anteriores deste documento é agente nativo do Copilot, não um `.agent.md` do projeto.)

Use-os para delegar tarefas especializadas durante o desenvolvimento.

---

**Última atualização deste handoff:** 19 de setembro de 2026, com base `main` em `8a3a66f` (PR #123); 5.6 e 5.7 concluídas, 5.5 parcial e 5.8 parcial (5.8.a e 5.8.b concluídas).
