# MATRIZ_PARIDADE_ANDROID.md — Matriz de paridade web/API/Android

> **Gate B** do `docs/PLANO_ANDROID_VALIDACAO_PUBLICACAO.md`.
> **Status:** rascunho iniciado em 18/11/2026 (PR pós-#158). O código Kotlin do
> LensClickApp ainda está fora deste repositório: as colunas Android estão **a
> classificar** e só podem ser preenchidas após o Gate A (levantamento técnico do
> app). Nenhuma afirmação de paridade é válida antes disso.
>
> **Fonte:** rotas em `src/router.mjs`, contratos em `test-support/api-contracts.mjs`
> (61 rotas / 68 contratos, verificados pelo teste `manifesto da API registra 52
> rotas e 59 contratos sem duplicatas`) e suíte `node --test` (264 testes).

## Como ler

- **Web:** `✅` = implementado e em produção com cobertura de testes; a rota da API
  está entre parênteses.
- **Android:** `?` = a classificar (aguarda Kotlin).
- **Decisão:** a classificar entre **paridade obrigatória**, **experiência Android
  equivalente**, **web-only justificado** ou **adiado com risco aceito** (Gate B).
- **Prioridade** = proposta para fatiamento do Gate D (fatias verticais pequenas,
  ordem recomendada: auth/conta → descoberta/perfis → perfil profissional →
  avaliações → mensagens → orçamentos).
- **Estado** = `A classificar` enquanto não houver Kotlin; muda para `Faltante`,
  `Diferente` ou `Paridade` após a auditoria.

## Inventário de capacidades

### 1. Autenticação e sessão

| Recurso | Contrato (método + rota) | Web | Android | Diferença | Prioridade | Dependência | Teste | Estado |
|---|---|---|---|---|---|---|---|---|
| Cadastro web | `POST /api/auth/register` | ✅ | ? | — | — | — | `auth-route-contracts` | A classificar |
| Cadastro móvel | `POST /api/mobile/auth/register` | ✅ (backend) | ? | — | P0 | ADR 001 | `mobile-auth-route-contracts` | A classificar |
| Login web | `POST /api/auth/login` | ✅ | ? | — | — | — | `auth-route-contracts` | A classificar |
| Login móvel | `POST /api/mobile/auth/login` | ✅ | ? | — | P0 | ADR 001/156 | `mobile-auth-route-contracts` | A classificar |
| Sessão web | cookie HttpOnly (`/api/auth/*`) | ✅ | N/A (Android usa Bearer) | web-only justificado | — | — | `auth-route-contracts` | A classificar |
| Sessão móvel | Bearer opaco + refresh rotativo | ✅ | ? | — | P0 | `POST /api/mobile/auth/refresh` | `mobile-auth-refresh` | A classificar |
| Renovação de sessão | `POST /api/mobile/auth/refresh` | ✅ | ? | — | P0 | ADR 001 | `mobile-auth-refresh` | A classificar |
| Identidade atual / expiração | `GET /api/auth/me`, `GET /api/mobile/auth/me` | ✅ | ? | — | P0 | ADR 001 | `mobile-auth-route-contracts` | A classificar |
| Logout web / móvel | `POST /api/auth/logout`, `POST /api/mobile/auth/logout` | ✅ | ? | — | P0 | ADR 001 | `mobile-auth-route-contracts` | A classificar |
| Recuperação de senha | `POST /api/auth/password-reset/request`, `.../confirm` | ✅ | ? | deep link ou tela nativa | P1 | Brevo | `password-reset` | A classificar |
| Verificação de e-mail | `POST /api/auth/email/verify`, `POST /api/auth/email/resend` | ✅ | ? | deep link ou tela nativa | P1 | Brevo | `email-verification` | A classificar |
| Limites de sessão | 5 web / 3 móveis (teto) | ✅ | ? | — | P1 | ADR 001 | `mobile-auth-refresh` | A classificar |
| Bloqueio por conta | 5 falhas / 15 min (429) | ✅ | ? | — | P1 | ADR 001 #6 | `mobile-auth-refresh` | A classificar |
| 2FA TOTP no app | `GET/POST /api/account/2fa/status\|setup\|enable\|disable`, `POST /api/mobile/auth/2fa/verify` | ✅ (backend) | ? | app `ad5cc75` fabrica o `challengeToken` e não trata 202 | **P0 (demo)** | ADR 002 / PR #160 | `two-factor` | A classificar |

### 2. Conta e dados do titular

| Recurso | Contrato | Web | Android | Diferença | Prioridade | Dependência | Teste | Estado |
|---|---|---|---|---|---|---|---|---|
| Edição de perfil (nome, fone, foto) | `PUT /api/profile`, `DELETE /api/account/photo` | ✅ | ? | — | P1 | R2 | `account-route-contracts` | A classificar |
| Troca de senha | `PUT /api/account/password` | ✅ | ? | — | P1 | — | `account-management` | A classificar |
| Exclusão de conta | `DELETE /api/account` | ✅ | ? | — | P1 | LGPD | `account-management` | A classificar |
| Exportação LGPD | `GET /api/account/export` | ✅ | ? | — | P2 | LGPD 5.5.a | `account-export` | A classificar |
| Imagem de perfil | `GET /api/profile-picture/:id` | ✅ | ? | — | P1 | R2 | `account-management` | A classificar |
| Foto na busca pública | `GET /api/photographers/:slug/photo` | ✅ | ? | — | P1 | R2 | `portfolio-public-route-contracts` | A classificar |
| Portfólio (até 12, capa, categoria) | `GET/POST/PUT/DELETE /api/account/portfolio*`, `GET .../portfolio/:id/image` | ✅ | ? | UX nativa de gestão | P2 | R2 + IMAGES | `portfolio-*` | A classificar |

### 3. Descoberta pública e perfil profissional

| Recurso | Contrato | Web | Android | Diferença | Prioridade | Dependência | Teste | Estado |
|---|---|---|---|---|---|---|---|---|
| Busca com filtros (preço, raio, ordenação) | `GET /api/photographers` | ✅ (URL hidratável) | ? | tela de busca nativa | P0 | Contrato de critérios; `docs/CONTRATO_ORCAMENTOS.md` não se aplica aqui | `search*` | A classificar |
| Perfil público + SSR | `GET /fotografo/:slug` (HTML), `GET /api/photographers/:slug` (JSON) | ✅ | ? | tela de perfil nativa; SSR é web-only justificado | P0 | SSR | `indexable-profile` | A classificar |
| Imagem do portfólio pública | `GET /api/photographers/:slug/portfolio/:id` | ✅ | ? | — | P1 | R2/IMAGES | `portfolio-public-route-contracts` | A classificar |
| Sitemap / robots | `/sitemap.xml`, `/robots.txt` | ✅ | N/A (web) | web-only justificado | — | — | `sitemap-robots` | A classificar |
| Metadados sociais / JSON-LD | Worker (`/fotografo/:slug`) | ✅ | N/A (web) | web-only justificado | — | — | `seo-static-metadata` | A classificar |

### 4. Avaliações e reputação

| Recurso | Contrato | Web | Android | Diferença | Prioridade | Dependência | Teste | Estado |
|---|---|---|---|---|---|---|---|---|
| Avaliações públicas | `GET /api/photographers/:slug/reviews` | ✅ | ? | — | P1 | — | `reviews` | A classificar |
| Solicitar avaliação (cliente) | `POST /api/photographers/:slug/review-requests` | ✅ | ? | — | P2 | — | `reviews` | A classificar |
| Gerir pedidos de avaliação | `GET/PUT /api/account/review-requests*` | ✅ | ? | — | P2 | — | `auth-route-contracts` | A classificar |
| Criar/editar/excluir avaliação | `POST .../review\-requests/:id/review`, `PUT/DELETE /api/account/reviews/:id` | ✅ | ? | — | P2 | — | `reviews` | A classificar |

### 5. Mensagens

| Recurso | Contrato | Web | Android | Diferença | Prioridade | Dependência | Teste | Estado |
|---|---|---|---|---|---|---|---|---|
| Criar conversa (cliente) | `POST /api/photographers/:slug/conversations` | ✅ | ? | — | P1 | — | `messaging` | A classificar |
| Listar inbox + não lidas | `GET /api/account/conversations` | ✅ | ? | — | P1 | — | `messaging` | A classificar |
| Mensagens (ler/enviar) | `GET/POST /api/account/conversations/:id/messages` | ✅ | ? | paginação | P1 | — | `messaging` | A classificar |
| Marcar como lida | `PUT /api/account/conversations/:id/read` | ✅ | ? | — | P1 | — | `messaging` | A classificar |

### 6. Orçamentos, propostas e favoritos (Android-first)

| Recurso | Contrato | Web | Android | Diferença | Prioridade | Dependência | Teste | Estado |
|---|---|---|---|---|---|---|---|---|
| Solicitar orçamento | `POST /api/photographers/:slug/budget-requests` | ✅ | ? | peça-chave do app | **P0** | `docs/CONTRATO_ORCAMENTOS.md` | `budgets` | A classificar |
| Listar meus pedidos | `GET /api/account/budget-requests` | ✅ | ? | — | **P0** | idem | `budgets` | A classificar |
| Detalhe do pedido + propostas | `GET /api/account/budget-requests/:id` | ✅ | ? | — | **P0** | idem | `budgets` | A classificar |
| Enviar proposta | `POST /api/account/budget-requests/:id/proposals` | ✅ | ? | peça-chave do app | **P0** | idem | `budgets` | A classificar |
| Aceitar/rejeitar/cancelar/retirar | `PUT /api/account/budget-requests/:id` | ✅ | ? | — | **P0** | idem | `budgets` | A classificar |
| Agenda do fotógrafo | `GET /api/account/agenda` | ✅ | ? | — | P1 | idem | `budgets` | A classificar |
| Favoritos (listar/add/remover) | `GET/POST/DELETE /api/account/favorites*` | ✅ | ? | — | P1 | idem | `budgets` | A classificar |

### 7. Administração (celular? decisão pendente)

| Recurso | Contrato | Web | Android | Diferença | Prioridade | Dependência | Teste | Estado |
|---|---|---|---|---|---|---|---|---|
| Visão geral | `GET /api/admin/overview` | ✅ | ? | **decisão pendente: admin no app?** | P3 | ADR/DECISÃO | `admin-*` | A classificar |
| Moderar avaliações | `GET/PUT /api/admin/reviews*` | ✅ | ? | idem | P3 | idem | `admin-moderation` | A classificar |
| Moderar conversas | `GET/PUT /api/admin/conversations*` | ✅ | ? | idem | P3 | idem | `admin-moderation` | A classificar |

### 8. Conta profissional e portfólio do fotógrafo

| Recurso | Contrato | Web | Android | Diferença | Prioridade | Dependência | Teste | Estado |
|---|---|---|---|---|---|---|---|---|
| Editar perfil profissional + publicar | `GET/PUT /api/account/professional-profile` | ✅ | ? | UX nativa | P2 | — | `professional-profile` | A classificar |
| Onboarding guiado | `public/perfil.html` (web) | ✅ | ? | fluxo nativo | P2 | — | `professional-profile` | A classificar |

### 9. Transversal (web/Android)

| Recurso | Contrato | Web | Android | Diferença | Prioridade | Dependência | Teste | Estado |
|---|---|---|---|---|---|---|---|---|
| i18n PT-BR/EN-US | catálogos + `lang.js` | ✅ | ? | catálogos nativos | P1 | decisão do app | `i18n-catalogs` | A classificar |
| Estados vazios / erros / offline | — | ✅ | ? | degradação em rede ruim | P1 | — | suíte/smoke | A classificar |
| Acessibilidade | axe, foco, aria | ✅ | ? | TalkBack | P1 | — | `html-scripts` | A classificar |
| Termos / Privacidade | páginas estáticas + consentimento | ✅ | ? | telas/links no app | P2 | 5.5.b | `legal` | A classificar |
| Contato / newsletter | `POST /api/contact`, `POST /api/newsletter` | ✅ | ? | tela de contato nativa | P1 | — | `public-input` | A classificar |
| Monitoramento / logs | Worker logs + D1 | ✅ | ? | versão do app nos logs (Gate C) | P2 | — | `observability` | A classificar |
| Health check | `GET /api/health` | ✅ | N/A | — | — | — | `d1-health` | A classificar |

## Decisões em aberto (decisão do mantenedor)

1. **Android no lançamento mínimo:** escopo do v1 — recomendação: todo o item 6
   (orçamentos) + item 1 (auth) + item 3 (busca/perfil público); demais fatias v1.x.
2. **Administração no celular:** admin web-only (recomendado, já é web-only no backend
   por `is_admin` + `requireAdmin`) ou fatia administrativa mínima no app?
3. **Deep links:** verificação de e-mail e redefinição de senha abrirão no app ou no
   navegador? (Afeta `/verificar-email` e `/redefinir-senha`.)
4. **i18n no app:** reusar os catálogos JSON como recurso Android (`strings.xml`
   gerado) ou manter inglês só na web?
5. **Notificações:** fora do escopo atual (não há push no backend); aceitar adiado.

## Saída esperada deste documento

Este rascunho garante ausência de lacunas **no backend** (todas as 52 rotas estão
representadas acima ou mapeadas em outra linha). As colunas Android são
preenchidas na auditoria (Gate A/B) com o código Kotlin em mãos.
