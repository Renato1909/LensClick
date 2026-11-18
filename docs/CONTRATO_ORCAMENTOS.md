# Contrato de Orçamentos e Propostas (backend LensClick ↔ Android)

Documento de paridade do contrato consumido pelo app LensClickApp (Android).
Cobre criação de pedido de orçamento, listagem, detalhe, envio de proposta,
decisão do cliente (aceitar/rejeitar), cancelamento, retirada de proposta e agenda.

Base: rotas `/api/...` existentes, mesmas convenções do backend (sem versionamento
de URL; a versão do contrato é este documento). Valores monetários **sempre em
centavos inteiros** (`priceCents`), nunca ponto flutuante.

## Autenticação

- Cliente/fotógrafo autenticam por **Bearer móvel** (`Authorization: Bearer <token>`)
  emitido por `POST /api/mobile/auth/login`, ou por cookie web quando consumido pelo site.
- As rotas de orçamentos estão na lista de principais móveis (`MOBILE_PRINCIPAL_ROUTES`):
  requisições com header `Authorization` passam sem exigir Origin e **nunca** fazem
  fallback para a sessão web se o token for inválido.
- Erros de autenticação: `401 { "error": "...", "code": "unauthenticated" }`.

## Endpoints

### POST /api/photographers/:slug/budget-requests
Cria pedido de orçamento para fotógrafo **publicado**.
- Papel exigido: `client`. Rate limit: 10/hora.
- Body: `{ eventType (2–80), eventDate (YYYY-MM-DD), place (2–160), duration? (≤80), description (10–1000), additionalInfo? (≤1000) }`
- `201 { "request": { "id": 1, "status": "pending" }, "message": "..." }`
- Erros: `unauthenticated` (401), `forbidden_role` (403, não-cliente), `forbidden_own_profile` (403), `not_found` (404, perfil inexistente/despublicado), `invalid_payload` (400), `conflict` (409, pedido ativo em andamento), `rate_limited` (429).

### GET /api/account/budget-requests
Lista pedidos do principal autenticado. Clientes veem seus pedidos; fotógrafos veem os recebidos.
- `200 { "role": "client"|"photographer", "requests": [ { id, eventType, eventDate, place, duration, description, additionalInfo, status, createdAt, updatedAt, counterpartName } ] }`

### GET /api/account/budget-requests/:id
Detalhe autorizado (somente cliente dono ou fotógrafo dono). Inclui propostas.
- `200 { "request": { ...campos acima, "proposals": [ { id, requestId, priceCents, conditions, status, createdAt } ] } }`
- Erros: `unauthenticated` (401), `not_found` (404), `forbidden_not_participant` (403).

### POST /api/account/budget-requests/:id/proposals
Envia proposta. Papel exigido: `photographer`. Rate limit: 20/hora.
- Body: `{ priceCents: inteiro entre 0 e 100000000, conditions? (≤1000) }`
- Só aceita pedido com status `pending` ou `proposed`, pertencente ao fotógrafo.
- `201 { "proposal": { "id": 1, "status": "pending" }, "message": "..." }`
- Erros: `unauthenticated` (401), `forbidden_role` (403, não-fotógrafo), `forbidden_not_owner` (403), `not_found` (404), `invalid_state` (409), `invalid_payload` (400), `conflict` (409, proposta pendente já existe), `rate_limited` (429).

### PUT /api/account/budget-requests/:id
Ações do fluxo. Body sempre `{ "action": ... }`:
- `action: "accept" | "reject"` — somente o cliente; exige pedido `proposed` e `proposalId` de proposta `pending`. Marca a proposta como `accepted`/`rejected`, rejeita as demais pendentes do pedido e atualiza o pedido. Resposta `200 { "request": { "id", "status" } }`.
- `action: "cancel"` — somente o cliente; pedido `pending`/`proposed` → `cancelled`; propostas pendentes viram `withdrawn`.
- `action: "withdraw"` — somente o fotógrafo; proposta `pending` → `withdrawn`; pedido volta a `pending`.
- Erros: `unauthenticated` (401), `invalid_payload` (400, ação desconhecida), `forbidden_role` (403), `not_found` (404), `invalid_state` (409).

### GET /api/account/agenda
Papel exigido: `photographer`. Lista pedidos `accepted` ordenados por data do evento.
- `200 { "events": [ { ...campos do pedido, "clientName" } ] }`

### Favoritos
- `GET /api/account/favorites` — papel `client`; `200 { "favorites": [ { photographerId, slug, name, createdAt } ] }`
- `POST /api/account/favorites` — body `{ slug }`; fotógrafo publicado exigido; idempotente por `(client_user_id, photographer_user_id)` (`INSERT ... ON CONFLICT DO NOTHING`); `201`.
- `DELETE /api/account/favorites/:photographerId` — `200`.

## Estados e transições (autoridade do servidor)

`budget_requests.status`: `pending → proposed → accepted | rejected`; `pending|proposed → cancelled`.
`proposals.status`: `pending → accepted | rejected | withdrawn`.
Transições fora dessas vias retornam `409 { "code": "invalid_state" }`. O servidor é a única
autoridade: o Android nunca transiciona estado localmente sem resposta do backend.

## Códigos de erro estáveis

Toda resposta de erro das rotas de orçamento traz `error` (humano, pt-BR, não parsear)
e `code` (estável, máquina):

| HTTP | code | Significado |
|------|------|-------------|
| 400 | `invalid_payload` | Payload inválido/ação desconhecida |
| 401 | `unauthenticated` | Sem sessão válida |
| 403 | `forbidden_role` | Papel incorreto para a ação |
| 403 | `forbidden_own_profile` | Ação sobre o próprio perfil |
| 403 | `forbidden_not_owner` | Pedido pertence a outro fotógrafo |
| 403 | `forbidden_not_participant` | Usuário não participa do pedido |
| 404 | `not_found` | Recurso inexistente/despublicado |
| 409 | `invalid_state` | Transição de estado inválida |
| 409 | `conflict` | Duplicidade (pedido ativo / proposta pendente) |
| 409 | `idempotency_key_reuse` | Chave de idempotência reutilizada com outro conteúdo |
| 429 | `rate_limited` | Limite de requisições excedido |

## Idempotência e proteção contra duplicação

- **`Idempotency-Key` (opcional, recomendado para o Android):** aceito em todas as
  mutações (`POST budget-requests`, `POST proposals`, `PUT .../budget-requests/:id`,
  `POST/DELETE favorites`). Formato: 8–200 caracteres `[A-Za-z0-9_-]`; inválido →
  `400 invalid_payload`.
  - A chave é escopada por `(key, user_id, route)`; o corpo é hasheado (SHA-256 de
    JSON estável) e comparado — mesma chave + mesmo conteúdo devolve a resposta
    gravada com `Idempotency-Replayed: true`, sem reexecutar a escrita.
  - Mesma chave + conteúdo diferente → `409 { "code": "idempotency_key_reuse" }`.
  - Somente respostas 2xx são gravadas; erros reexecutam a operação.
  - Entradas com mais de 7 dias são removidas oportunisticamente (tabela
    `idempotency_keys`, migration `0016_idempotency_keys.sql`).
- **Defesa em profundidade (sempre ativa, independente do header):**
  - **Criação de pedido:** índice único parcial `idx_budget_requests_one_active` em
    `(client_user_id, photographer_user_id) WHERE status IN ('pending','proposed')`.
    Segunda criação concorrente/redundante → `409 conflict`. No máximo um pedido ativo por par.
  - **Envio de proposta:** índice único parcial `idx_proposals_one_pending` em `(request_id)
    WHERE status = 'pending'`. Segunda proposta pendente → `409 conflict`.
  - **Aceitar/rejeitar:** somente proposta `pending` em pedido `proposed`; a segunda decisão
    retorna `409 invalid_state`. A atualização da proposta escolhida e a rejeição das demais
    acontecem no mesmo `batch` (transação).
  - **Favoritos:** `INSERT ... ON CONFLICT DO NOTHING` — adicionar duas vezes é seguro.

## Limites

- `priceCents` inteiro: `0 … 100000000` (R$ 0,00 a R$ 1.000.000,00).
- Campos de texto validados por tamanho (ver endpoint); `eventDate` no formato `YYYY-MM-DD`.
- Rate limits: pedido 10/h, proposta 20/h, favoritos 30/h, por principal.
- Auditoria: toda transição grava em `budget_audit` (`created|proposed|accepted|rejected|cancelled|withdrawn`).
