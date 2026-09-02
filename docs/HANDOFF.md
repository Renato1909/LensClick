# HANDOFF — LensClick

> Documento de transferência do projeto. Representa o estado atual e serve como guia para quem assumir o desenvolvimento a partir de agora.
>
> **Data de referência:** 1º de setembro de 2026, com `main` em `f9d8e53`.
> **Fonte primária:** `docs/CONTEXTO_PROJETO.md` + estado ao vivo do git.
> **Estado do roadmap:** Fase 1, marco de transição, Fase 2, iniciativas 3.1–3.4, Fase 4.1 e a Fase 4.2 concluídas — todos os handlers de domínio extraídos e os blocos legados removidos no PR #82; próximas prioridades: concluir a 4.3 (variantes de imagem) e a 4.4 (alertas automatizados).

---

## 1. Situação atual da main

- **Branch:** `main` → commit `0295292` — "fix: order sitemap profiles by user id" (#55).
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

### Tabelas D1 (8)

`users`, `sessions`, `password_reset_tokens`, `contact_messages`, `newsletter_subscriptions`, `rate_limits`, `professional_profiles`, `portfolio_items`.

### Migrações publicadas (6)

`0001_initial.sql`, `0002_password_reset.sql`, `0003_professional_profiles.sql`, `0004_portfolio_items.sql`, `0005_search_indexes.sql`, `0006_search_price_radius_indexes.sql`.

> ⚠️ **Regra de ouro:** nunca editar migrações já publicadas. Criar nova `0007_*.sql` para qualquer alteração de schema.

---

## 2. Branches atuais

- **Branches locais:** somente `main`.
- **Branches remotas:** somente `origin/main` (além do ponteiro simbólico `origin/HEAD -> origin/main`).
- **Branches sem upstream:** nenhuma.
- **Trabalho pendente em branches:** nenhum.

A limpeza controlada foi concluída após comparar a árvore de cada branch obsoleta com o commit squash correspondente em `main`. As duas branches locais que estavam órfãs também apresentaram conteúdo idêntico aos PRs #2 e #3 já incorporados; nenhum trabalho exclusivo foi removido.

---

## 3. Funcionalidades em desenvolvimento

Não há iniciativa em desenvolvimento em uma branch ativa. As quatro iniciativas da Fase 1, o marco de transição e a Fase 4.2 estão integrados e validados em produção. O catálogo e o despacho HTTP ficam em `src/router.mjs`; os handlers de domínio vivem em módulos próprios (`src/auth.mjs`, `photographers.mjs`, `account.mjs`, `account-security.mjs`, `portfolio.mjs`, `public-input.mjs`, `observability.mjs`) e o `worker.mjs` permanece como ponto de composição (782 linhas após o PR #82). As funcionalidades de produto abaixo já estão em `main` e em produção:

### Funcionalidades entregues

- **Landing page** (`public/index.html`) — redesign editorial premium, hero com CTA para busca.
- **Cadastro e login** — autenticação com PBKDF2, sessões em D1.
- **Recuperação de senha** — fluxo via Brevo com tokens de uso único (`password_reset_tokens`).
- **Central da conta** (`public/perfil.html`) — edição de perfil, troca de senha, exclusão definitiva.
- **Onboarding profissional guiado** (`public/perfil.html`) — fluxo em etapas, validação contextual e retomada do rascunho persistido no D1.
- **Upload de foto de perfil** — armazenamento em R2 (bucket privado).
- **Exclusão definitiva da conta** — com confirmação e limpeza de dados.
- **Perfil profissional público** (`public/fotografo.html`) — `professional_profiles`.
- **Portfólio** — até 12 itens por fotógrafo, imagens em R2 (`portfolio_items`).
- **Página pública do fotógrafo** — exibe perfil + portfólio.
- **Busca** (`public/busca.html`) — filtros por cidade/estado, preservação de cidade ao trocar estado.
- **Contato** — formulário com `contact_messages`.
- **Newsletter** — inscrições em `newsletter_subscriptions`.
- **Bilíngue PT-BR/EN-US** — catálogos JSON separados, fallback progressivo e runtime `public/lang.js` com `window.i18n`.
- **Header redesign** — botão de busca responsivo.
- **Redesign editorial** — textura de fundo premium.

### Não implementado (gaps identificados)

- Sem Open Graph / JSON-LD (SEO social e dados estruturados).
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

9. **Termos e política precisam de revisão legal** — `public/termos.html` e `public/privacidade.html` são rascunhos.

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

### P4 — SEO e presença (médio prazo, baixo risco)
- Open Graph e JSON-LD (sitemap e robots já concluídos na Fase 3.4).
- Cache via `caches.default` para assets e respostas imutáveis.

### P5 — Segurança (médio/longo prazo, alto risco)
- Verificação de e-mail no cadastro.
- 2FA opcional.
- Autorização por papel (roles).
- Revisão legal de termos e política.

---

## 8. Ordem recomendada de execução

```
1. [Fase 4.3/4.4] Concluir variantes de imagem e alertas automatizados   ← 4.2 concluída no PR #82
2. [P5] Segurança: verificação e-mail, 2FA, roles   ← revisão dedicada de alto risco
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
- P5 (segurança) fica por último por ser o mais sensível e exigir revisão dedicada — mas não deve ser adiado indefinidamente.

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

- **Migrações imutáveis** — nunca editar `0001`–`0006`. Nova alteração de schema = novo arquivo `0007_*.sql`.
- **Fast-forward only** — `main` não aceita merge commits. Todo PR é squash-mergeado.
- **Status check obrigatório** — o CI "Qualidade" precisa passar antes do merge. Rodar `npm test` e `npm run check` localmente antes de abrir PR.
- **i18n** — toda string visível ao usuário deve passar por `window.i18n`; cada chave precisa existir em `public/locales/pt-BR.json` e `public/locales/en-US.json`. Não hardcoded em PT ou EN.
- **Design tokens** — usar variáveis `--lc-*` de `public/refinements.css`. Não introduzir cores/espaçamentos hardcoded.
- **R2 privado** — imagens nunca são públicas; sempre servidas via Worker com validação de sessão quando aplicável.

### Hotspots de conflito

- `src/worker.mjs` — toda feature de backend toca este arquivo. Trabalhar em branches curtos e merge rápido para reduzir conflitos.
- `public/locales/pt-BR.json` e `public/locales/en-US.json` — toda feature de UI adiciona chaves equivalentes nos dois arquivos. Mesma recomendação.

### Documentação de referência

- `docs/CONTEXTO_PROJETO.md` — onboarding permanente (fonte primária deste handoff).
- `docs/ROADMAP_EVOLUCAO.md` — plano de evolução técnica (Fase 4.2 concluída; próximas: 4.3 e 4.4).
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

**Última atualização deste handoff:** 1º de setembro de 2026, com `main` em `f9d8e53`; a Fase 4.2 foi concluída — extração completa dos handlers de domínio e remoção dos blocos legados no PR #82 (`worker.mjs` de 1.344 para 782 linhas).
