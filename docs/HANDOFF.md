# HANDOFF — LensClick

> Documento de transferência do projeto. Representa o estado atual e serve como guia para quem assumir o desenvolvimento a partir de agora.
>
> **Data de referência:** 24 de agosto de 2026, com `main` em `f94413e`.
> **Fonte primária:** `docs/CONTEXTO_PROJETO.md` + estado ao vivo do git.
> **Estado da Fase 1:** iniciativas 1.1, 1.2, 1.3 e 1.4 concluídas; a próxima prioridade é o marco de transição entre as Fases 1 e 2.

---

## 1. Situação atual da main

- **Branch:** `main` → commit `f94413e` — "feat: add D1 health check and search indexes" (#32).
- **Working tree após a integração:** limpa e sincronizada com `origin/main`; branch da iniciativa removida local e remotamente.
- **Sincronização:** `main` está alinhada com `origin/main` (nenhum commit local à frente ou atrás).
- **Proteção da branch (`main`):** configurada como **strict**:
  - Status checks obrigatórios: "Testes e validação" (CI GitHub Actions "Qualidade").
  - `enforce_admins`: true.
  - `required_linear_history`: true → **apenas fast-forward**, sem merge commits.
  - `allow_force_pushes`: false; `allow_deletions`: false.
  - `required_conversation_resolution`: true.
  - Revisões aprovadoras exigidas: 0 (mas o fluxo de PR é obrigatório).
- **CI:** workflow "Qualidade" — `npm ci` → `npm test` → `npm run check` (deploy dry-run). Concorrência cancela execuções antigas do mesmo PR/branch. Timeout de 10 min.
- **Ambiente de produção:** Cloudflare Worker em https://lensclick.renato-aparecido-business.workers.dev.
- **Repositório:** https://github.com/Renato1909/LensClick.git.

### Stack técnica

| Camada | Tecnologia |
|---|---|
| Runtime | Cloudflare Workers (serverless) |
| Banco de dados | D1 `lensclick-db` (SQLite) — 8 tabelas |
| Armazenamento de imagens | R2 `lensclick-profile-images` (bucket privado) |
| Assets estáticos | Workers Assets (`public/`) |
| E-mail transacional | Brevo |
| Senhas | Web Crypto — PBKDF2-SHA-256, 100k iterações |
| Frontend | HTML/CSS/JS vanilla, sem framework |
| i18n | `public/lang.js` (`window.i18n`) — PT/EN |
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

### Tabelas D1 (8)

`users`, `sessions`, `password_reset_tokens`, `contact_messages`, `newsletter_subscriptions`, `rate_limits`, `professional_profiles`, `portfolio_items`.

### Migrações publicadas (5)

`0001_initial.sql`, `0002_password_reset.sql`, `0003_professional_profiles.sql`, `0004_portfolio_items.sql`, `0005_search_indexes.sql`.

> ⚠️ **Regra de ouro:** nunca editar migrações já publicadas. Criar nova `0006_*.sql` para qualquer alteração de schema.

---

## 2. Branches atuais

- **Branches locais:** somente `main`.
- **Branches remotas:** somente `origin/main` (além do ponteiro simbólico `origin/HEAD -> origin/main`).
- **Branches sem upstream:** nenhuma.
- **Trabalho pendente em branches:** nenhum.

A limpeza controlada foi concluída após comparar a árvore de cada branch obsoleta com o commit squash correspondente em `main`. As duas branches locais que estavam órfãs também apresentaram conteúdo idêntico aos PRs #2 e #3 já incorporados; nenhum trabalho exclusivo foi removido.

---

## 3. Funcionalidades em desenvolvimento

Não há iniciativa em desenvolvimento em uma branch ativa. As quatro iniciativas da Fase 1 estão integradas; observabilidade (1.1), contratos por rota (1.2), rate limiting nativo (1.3) e índices/health check do D1 (1.4) foram publicados e validados em produção. As funcionalidades de produto abaixo já estão em `main` e em produção:

### Funcionalidades entregues

- **Landing page** (`public/index.html`) — redesign editorial premium, hero com CTA para busca.
- **Cadastro e login** — autenticação com PBKDF2, sessões em D1.
- **Recuperação de senha** — fluxo via Brevo com tokens de uso único (`password_reset_tokens`).
- **Central da conta** (`public/perfil.html`) — edição de perfil, troca de senha, exclusão definitiva.
- **Upload de foto de perfil** — armazenamento em R2 (bucket privado).
- **Exclusão definitiva da conta** — com confirmação e limpeza de dados.
- **Perfil profissional público** (`public/fotografo.html`) — `professional_profiles`.
- **Portfólio** — até 12 itens por fotógrafo, imagens em R2 (`portfolio_items`).
- **Página pública do fotógrafo** — exibe perfil + portfólio.
- **Busca** (`public/busca.html`) — filtros por cidade/estado, preservação de cidade ao trocar estado.
- **Contato** — formulário com `contact_messages`.
- **Newsletter** — inscrições em `newsletter_subscriptions`.
- **Bilíngue PT/EN** — `public/lang.js` com `window.i18n`.
- **Header redesign** — botão de busca responsivo.
- **Redesign editorial** — textura de fundo premium.

### Não implementado (gaps identificados)

- Sem `sitemap.xml` / `robots.txt`.
- Sem Open Graph / JSON-LD (SEO social e dados estruturados).
- Sem cache via `caches.default`.
- Sem 2FA / verificação de e-mail.
- O rate limiting permanece deliberadamente híbrido: escudo de rajada nativo na edge e políticas longas autoritativas no D1.
- A suíte de contratos cobre os 22 padrões de rota e os 25 contratos HTTP catalogados; testes ponta a ponta com serviços reais permanecem fora do escopo atual.
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

> Nota: o PR #15 não aparece no histórico mergeado consultado; a numeração foi pulada ou o PR não foi integrado.

### Documentos de PR em `tmp/`

- `tmp/account-management-pr.md` — PR do gerenciamento de conta.
- `tmp/password-reset-pr.md` — PR da recuperação de senha.
- `tmp/pr-body.md` — corpo genérico de PR.
- `tmp/pr-fix-public-shell.md` — PR #14 (fix public-shell).
- `tmp/github-flow-pr.md` — PR do fluxo CI/CD.

---

## 5. Decisões recentes

- **Fluxo de PR obrigatório** — toda alteração via Pull Request, squash merge, fast-forward only. Branch protection strict em `main`.
- **Squash merge** — commits de PR são squashed em um único commit no histórico. Por isso os branches locais ficam obsoletos após o merge.
- **Agentes Copilot** — o PR #17 adicionou 10 agentes em `.github/agents/` (Arquiteto, Backend, Frontend, Banco de Dados, DevOps, QA, Segurança, SEO/Performance, Marketing, Revisor de Código). O repositório possui **11 agentes no total**: o Designer já havia sido adicionado anteriormente pelo PR #13.
- **Roadmap técnico baseline** documentado (PR #16) — `docs/ROADMAP_EVOLUCAO.md` com Fases 1 a N.
- **Contexto permanente versionado** (PR #18) — `docs/AI_CONTEXT.md`, `docs/CONTEXTO_PROJETO.md`, `docs/HANDOFF.md` e `docs/DECISOES_TECNICAS.md` foram incorporados à `main`.
- **Design System** formalizado em `DESIGN_SYSTEM.md` e tokens `--lc-*` em `public/refinements.css`.
- **i18n centralizado** em `public/lang.js` — toda string de UI passa por `window.i18n`.
- **R2 privado** — imagens de perfil e portfólio não são públicas; servidas via Worker.
- **Brevo** como provedor de e-mail transacional (recuperação de senha).
- **Migrações imutáveis** — regra estabelecida: nunca editar migração publicada.
- **Contratos por rota** — a iniciativa 1.2 consolidou infraestrutura compartilhada de testes e cobriu os 21 padrões de rota e 24 contratos HTTP catalogados, sem alterar código de produção.
- **Rate limiting híbrido** — a iniciativa 1.3 adicionou quatro bindings nativos de 60 segundos como escudo de rajada e preservou as políticas longas no D1 como camada autoritativa e fallback.
- **Health check mínimo e seguro** — `GET /api/health` executa `SELECT 1` no D1, retorna somente estado genérico e não consulta o R2 para evitar operações artificiais.
- **Índices orientados pelas consultas reais** — a migration `0005` adicionou índices para listagem, estado e disponibilidade; o índice explícito redundante de `slug` foi removido, preservando o autoíndice da restrição `UNIQUE`.

---

## 6. Riscos conhecidos

### Críticos

1. **Sem 2FA / verificação de e-mail** — contas podem ser criadas com e-mail não verificado; risco de abuso e account takeover.
2. **Políticas longas ainda usam D1** — o escudo nativo protege rajadas, mas as janelas de 15 minutos e 1 hora continuam em `rate_limits`. A arquitetura é intencional e segura, porém ainda consome D1 nas rotas protegidas.
3. **Roles não autorizam áreas** — não há autorização por papel; qualquer usuário autenticado acessa as mesmas rotas.

### Técnicos

4. **Hotspots de conflito** — `src/worker.mjs` e `public/lang.js` são tocados por praticamente toda feature. Alto risco de conflito de merge.
5. **Sem alertas e SLOs** — os logs estruturados existem, mas a detecção proativa pertence à Fase 4.
6. **Health check não cobre R2** — decisão deliberada para não gerar operações artificiais; indisponibilidade do bucket é detectada pelos eventos das rotas reais de imagem.
7. **SEO incompleto** — sem `sitemap.xml`, `robots.txt`, Open Graph, JSON-LD. Impacta indexação e compartilhamento social.
8. **Sem cache** — `caches.default` não utilizado; toda requisição pode bater no D1/R2.

### Legais / Processo

9. **Termos e política precisam de revisão legal** — `public/termos.html` e `public/privacidade.html` são rascunhos.

---

## 7. Tarefas prioritárias

Prioridades derivadas de `docs/CONTEXTO_PROJETO.md` e `docs/ROADMAP_EVOLUCAO.md`. A limpeza de branches foi concluída e os documentos permanentes de contexto foram versionados pelo PR #18. As prioridades pendentes agora são:

### P3 — Fase 1 do Roadmap (médio prazo, médio risco)
- **1.1 Observabilidade** — concluída: integrada pelo PR #22, publicada e validada em produção.
- **1.2 Suíte de testes por rota** — concluída pelos PRs #25–#28: 21 padrões de rota e 24 contratos HTTP cobertos; 116 testes aprovados no snapshot de integração.
- **1.3 Rate limiting nativo Cloudflare** — concluída pelo PR #30 e validada em produção após aproximadamente 58 horas: 0 respostas `429` inesperadas, 0 erros `5xx` e nenhum rollback.
- **1.4 Índices e health check D1** — concluída pelo PR #32: migration `0005` aplicada no D1 remoto, `GET /api/health` validado com `200`, buscas públicas validadas e versão `83c02bf5-5fa3-4ce2-ac66-d2023a5f82ba` servindo 100% do tráfego, sem rollback.

### Marco de transição entre Fases 1 e 2 (próxima ação)
- Extrair o roteamento de `src/worker.mjs` para `src/router.mjs`, preservando integralmente o comportamento.
- Usar a suíte automatizada como rede de segurança antes e depois da extração.
- Não iniciar mudanças de UX da Fase 2 no mesmo PR estrutural.

### P4 — SEO e presença (médio prazo, baixo risco)
- `sitemap.xml`, `robots.txt`, Open Graph, JSON-LD.
- Cache via `caches.default` para assets e respostas imutáveis.

### P5 — Segurança (médio/longo prazo, alto risco)
- Verificação de e-mail no cadastro.
- 2FA opcional.
- Autorização por papel (roles).
- Revisão legal de termos e política.

---

## 8. Ordem recomendada de execução

```
1. [Transição] Extrair roteador para src/router.mjs ← atividade estrutural, risco médio
2. [Fase 2] Iniciar onboarding guiado do fotógrafo ← próxima evolução de produto
3. [P4] SEO: sitemap, robots, OG, JSON-LD, cache    ← 1-2 dias, baixo risco
4. [P5] Segurança: verificação e-mail, 2FA, roles   ← 3-5 dias, alto risco
```

**Justificativa da ordem:**
- O catálogo `db/schema.ts` já foi sincronizado pelo PR #20 e a observabilidade foi validada antes da integração.
- A iniciativa 1.2 criou a cobertura de regressão necessária antes das mudanças de rate limiting e health check.
- A iniciativa 1.3 foi concluída com uma arquitetura híbrida e rollback documentado.
- A iniciativa 1.4 foi concluída com migration remota, health check e smoke test de produção; a Fase 1 está encerrada.
- O marco estrutural do roteador deve ocorrer antes da Fase 2, conforme o roadmap técnico.
- P4 (SEO) é independente e pode ocorrer depois do marco de transição.
- P5 (segurança) fica por último por ser o mais sensível e exigir revisão dedicada — mas não deve ser adiado indefinidamente.

---

## 9. Observações importantes para quem continuar

### Ambiente (Windows)

- **`safe.directory` obrigatório:** ao trabalhar neste repositório no Windows, rodar primeiro:
  ```
  git config --global --add safe.directory 'D:/LensClick - Hoje'
  ```
  Sem isso, o git falha com "fatal: detected dubious ownership".
- **PowerShell, não bash:** este ambiente usa PowerShell 5.1. Sintaxe bash (loops `for`, `&&`) não funciona. Usar `foreach`, `;` para encadear, e `Select-Object`/`Where-Object` em vez de pipes unix.
- **Auth do git remoto quebrada neste ambiente:** `git ls-remote`, `git fetch` e operações de rede podem falhar com erro de autenticação (token/password não suportado). Para push/pull/PR, usar o GitHub via navegador ou outro terminal com credenciais configuradas.

### Convenções do projeto

- **Migrações imutáveis** — nunca editar `0001`–`0005`. Nova alteração de schema = novo arquivo `0006_*.sql`.
- **Fast-forward only** — `main` não aceita merge commits. Todo PR é squash-mergeado.
- **Status check obrigatório** — o CI "Qualidade" precisa passar antes do merge. Rodar `npm test` e `npm run check` localmente antes de abrir PR.
- **i18n** — toda string visível ao usuário deve passar por `window.i18n` (`public/lang.js`). Não hardcoded em PT ou EN.
- **Design tokens** — usar variáveis `--lc-*` de `public/refinements.css`. Não introduzir cores/espaçamentos hardcoded.
- **R2 privado** — imagens nunca são públicas; sempre servidas via Worker com validação de sessão quando aplicável.

### Hotspots de conflito

- `src/worker.mjs` — toda feature de backend toca este arquivo. Trabalhar em branches curtos e merge rápido para reduzir conflitos.
- `public/lang.js` — toda feature de UI adiciona chaves de i18n aqui. Mesma recomendação.

### Documentação de referência

- `docs/CONTEXTO_PROJETO.md` — onboarding permanente (fonte primária deste handoff).
- `docs/ROADMAP_EVOLUCAO.md` — plano de evolução técnica (Fase 1 concluída; marco de transição é o próximo passo).
- `docs/OBSERVABILIDADE.md` — contrato dos eventos, privacidade, consultas, evidências e rollback da iniciativa 1.1.
- `docs/RATE_LIMITING.md` — arquitetura híbrida, políticas, evidências de produção e rollback da iniciativa 1.3.
- `docs/D1_HEALTH.md` — contrato do health check, índices, operação, evidências e rollback da iniciativa 1.4.
- `docs/DOCUMENTACAO_TECNICA.md` — documentação técnica detalhada.
- `DESIGN_SYSTEM.md` — guia de design e tokens.
- `CONTRIBUTING.md` — fluxo de contribuição.
- `CLOUDFLARE_SETUP.md` — configuração do Cloudflare (D1, R2, Workers).

### Agentes Copilot disponíveis (`.github/agents/`)

Arquiteto de Software · Engenheiro Backend · Engenheiro Frontend · Engenheiro de Banco de Dados · Engenheiro DevOps · Engenheiro de QA · Especialista em Segurança · Especialista em SEO e Performance · Especialista em Marketing para Fotografia · Revisor de Código · Explore.

Use-os para delegar tarefas especializadas durante o desenvolvimento.

---

**Última atualização deste handoff:** 24 de agosto de 2026, com `main` em `f94413e`; Fase 1 concluída. A iniciativa 1.4 foi integrada pelo PR #32, a migration `0005` foi aplicada no D1 remoto e a versão `83c02bf5-5fa3-4ce2-ac66-d2023a5f82ba` foi validada em produção com health check, busca pública e observabilidade, sem rollback.
