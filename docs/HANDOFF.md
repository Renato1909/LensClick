# HANDOFF — LensClick

> Documento de transferência do projeto. Representa o estado atual e serve como guia para quem assumir o desenvolvimento a partir de agora.
>
> **Data de referência:** estado do repositório em `main` HEAD `2beb80a`.
> **Fonte primária:** `docs/CONTEXTO_PROJETO.md` + estado ao vivo do git.
> **Escopo:** apenas documentação. Nenhum código foi alterado, nenhum commit ou push foi feito.

---

## 1. Situação atual da main

- **Branch:** `main` → commit `2beb80a` — "docs: add permanent project context (#18)".
- **Working tree:** somente `docs/HANDOFF.md` modificado e não adicionado ao staging, como parte desta atualização operacional; nenhum código foi alterado.
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
| Testes | Node.js test runner (`node --test`) — 55 testes, 14 arquivos |
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

### Migrações publicadas (4)

`0001_initial.sql`, `0002_password_reset.sql`, `0003_professional_profiles.sql`, `0004_portfolio_items.sql`.

> ⚠️ **Regra de ouro:** nunca editar migrações já publicadas. Criar nova `0005_*.sql` para qualquer alteração de schema.

---

## 2. Branches atuais

- **Branches locais:** somente `main`.
- **Branches remotas:** somente `origin/main` (além do ponteiro simbólico `origin/HEAD -> origin/main`).
- **Branches sem upstream:** nenhuma.
- **Trabalho pendente em branches:** nenhum.

A limpeza controlada foi concluída após comparar a árvore de cada branch obsoleta com o commit squash correspondente em `main`. As duas branches locais que estavam órfãs também apresentaram conteúdo idêntico aos PRs #2 e #3 já incorporados; nenhum trabalho exclusivo foi removido.

---

## 3. Funcionalidades em desenvolvimento

Não há funcionalidades em andamento ativo em branches locais. Todo o trabalho já está em `main`. As funcionalidades abaixo **já estão em produção**:

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
- Sem endpoint `/api/health` ou health check do D1.
- Sem Open Graph / JSON-LD (SEO social e dados estruturados).
- Sem cache via `caches.default`.
- Sem 2FA / verificação de e-mail.
- Sem rate limiting nativo Cloudflare (atualmente D1 simples em `rate_limits`).
- Sem logs estruturados / observabilidade.
- Sem cobertura de testes por rota (testes existentes são por fase/feature, não por rota).

---

## 4. PRs relevantes

Todos os PRs relevantes de #1 a #18 listados abaixo já foram **mergeados** em `main`. Histórico (squash, fast-forward):

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

---

## 6. Riscos conhecidos

### Críticos

1. **`db/schema.ts` desatualizado** — `schemaVersion = 2`, lista apenas 6 tabelas (faltam `professional_profiles` e `portfolio_items`). O D1 real tem 8 tabelas (schema version 4). Qualquer código que confie em `schema.ts` para validação/migração está inconsistente.
2. **Sem 2FA / verificação de e-mail** — contas podem ser criadas com e-mail não verificado; risco de abuso e account takeover.
3. **Rate limiting simples em D1** — `rate_limits` é uma tabela D1, não o rate limiting nativo Cloudflare. Sob carga, consome quota de D1 e não escala como edge.
4. **Roles não autorizam áreas** — não há autorização por papel; qualquer usuário autenticado acessa as mesmas rotas.

### Técnicos

5. **Hotspots de conflito** — `src/worker.mjs` (926 linhas, 21 rotas em cadeia if/regex) e `public/lang.js` (933 linhas) são tocados por praticamente toda feature. Alto risco de conflito de merge.
6. **Sem observabilidade** — sem logs estruturados; difícil diagnosticar incidentes em produção.
7. **Sem health check** — sem endpoint `/api/health` ou verificação de D1/R2.
8. **SEO incompleto** — sem `sitemap.xml`, `robots.txt`, Open Graph, JSON-LD. Impacta indexação e compartilhamento social.
9. **Sem cache** — `caches.default` não utilizado; toda requisição pode bater no D1/R2.

### Legais / Processo

10. **Termos e política precisam de revisão legal** — `public/termos.html` e `public/privacidade.html` são rascunhos.

---

## 7. Tarefas prioritárias

Prioridades derivadas de `docs/CONTEXTO_PROJETO.md` e `docs/ROADMAP_EVOLUCAO.md`. A limpeza de branches foi concluída e os documentos permanentes de contexto foram versionados pelo PR #18. As prioridades pendentes agora são:

### P1 — Atualizar `db/schema.ts` (rápido, médio risco)
- Atualizar `schemaVersion` para 4 e adicionar `professional_profiles` e `portfolio_items` em `tables`. Manter sincronizado com as migrações 0003 e 0004.

### P3 — Fase 1 do Roadmap (médio prazo, médio risco)
- **1.1 Observabilidade** — logs estruturados no Worker.
- **1.2 Suite de testes por rota** — cobertura de cada uma das 21 rotas.
- **1.3 Rate limiting nativo Cloudflare** — substituir `rate_limits` D1 por solução edge.
- **1.4 Índices e health check D1** — revisar índices, criar `/api/health`.

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
1. [P1] Atualizar db/schema.ts (schemaVersion=4)    ← 15 min, médio risco
2. [P3.1] Observabilidade: logs estruturados        ← 1-2 dias, médio risco
3. [P3.2] Health check /api/health + índices D1     ← 0,5 dia, baixo risco
4. [P3.3] Testes por rota (21 rotas)                ← 2-3 dias, baixo risco
5. [P3.4] Rate limiting nativo Cloudflare           ← 1 dia, médio risco
6. [P4] SEO: sitemap, robots, OG, JSON-LD, cache    ← 1-2 dias, baixo risco
7. [P5] Segurança: verificação e-mail, 2FA, roles   ← 3-5 dias, alto risco
```

**Justificativa da ordem:**
- A limpeza de branches e o versionamento dos documentos de contexto estão concluídos; atualizar `db/schema.ts` é o próximo débito de higiene pendente.
- P3 segue a ordem do roadmap: observabilidade primeiro (sem ela, difícil medir impacto das mudanças), depois health check (base para monitorar), depois testes (rede de segurança), por fim rate limiting (mudança de arquitetura).
- P4 (SEO) é independente e pode rodar em paralelo com P3 se houver mais de uma pessoa.
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

- **Migrações imutáveis** — nunca editar `0001`–`0004`. Nova alteração de schema = novo arquivo `0005_*.sql`.
- **Fast-forward only** — `main` não aceita merge commits. Todo PR é squash-mergeado.
- **Status check obrigatório** — o CI "Qualidade" precisa passar antes do merge. Rodar `npm test` e `npm run check` localmente antes de abrir PR.
- **i18n** — toda string visível ao usuário deve passar por `window.i18n` (`public/lang.js`). Não hardcoded em PT ou EN.
- **Design tokens** — usar variáveis `--lc-*` de `public/refinements.css`. Não introduzir cores/espaçamentos hardcoded.
- **R2 privado** — imagens nunca são públicas; sempre servidas via Worker com validação de sessão quando aplicável.

### Hotspots de conflito

- `src/worker.mjs` (926 linhas) — toda feature de backend toca este arquivo. Trabalhar em branches curtos e merge rápido para reduzir conflitos.
- `public/lang.js` (933 linhas) — toda feature de UI adiciona chaves de i18n aqui. Mesma recomendação.

### Documentação de referência

- `docs/CONTEXTO_PROJETO.md` — onboarding permanente (fonte primária deste handoff).
- `docs/ROADMAP_EVOLUCAO.md` — plano de evolução técnica (Fase 1 em andamento).
- `docs/DOCUMENTACAO_TECNICA.md` — documentação técnica detalhada.
- `DESIGN_SYSTEM.md` — guia de design e tokens.
- `CONTRIBUTING.md` — fluxo de contribuição.
- `CLOUDFLARE_SETUP.md` — configuração do Cloudflare (D1, R2, Workers).

### Agentes Copilot disponíveis (`.github/agents/`)

Arquiteto de Software · Engenheiro Backend · Engenheiro Frontend · Engenheiro de Banco de Dados · Engenheiro DevOps · Engenheiro de QA · Especialista em Segurança · Especialista em SEO e Performance · Especialista em Marketing para Fotografia · Revisor de Código · Explore.

Use-os para delegar tarefas especializadas durante o desenvolvimento.

---

**Última atualização deste handoff:** estado de `main` em `2beb80a`, após o merge do PR #18 e a limpeza controlada de branches obsoletas.
