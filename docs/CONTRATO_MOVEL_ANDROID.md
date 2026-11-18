# CONTRATO_MOVEL_ANDROID.md — Guia de integração do LensClickApp com o backend

> Guia para quem implementar/manter o LensClickApp (Kotlin) consumindo este backend.
> Complementa `docs/ADR_001_AUTENTICACAO_MOVEL.md` (decisão),
> `docs/CONTRATO_ORCAMENTOS.md` (fluxo de orçamentos) e
> `docs/MATRIZ_PARIDADE_ANDROID.md` (escopo e prioridades).
>
> **Status:** o backend está pronto para a fase de integração. O código Android
> ainda não está versionado neste repositório; este documento é a fonte de verdade
> do lado servidor.

## Base URL

- Produção: `https://lensclick.renato-aparecido-business.workers.dev`
  (muda para domínio próprio no Gate G — centralizar em uma única constante/
  BuildConfig no app; **nunca** hardcodar por tela).
- Todas as rotas falam **JSON** (`application/json; charset=utf-8`).
- Respostas JSON sempre incluem `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`.

## Autenticação

Sessão móvel = **Bearer opaco** (43 chars base64url, `[A-Za-z0-9_-]{43}`),
armazenado apenas como hash SHA-256 no D1. O app nunca vê esse hash; o token é o
próprio segredo.

### Cadastro — `POST /api/mobile/auth/register`

```http
POST /api/mobile/auth/register
Content-Type: application/json

{ "name": "Nome", "email": "voce@example.com", "phone": "(11) 99999-9999",
  "password": "Segura123", "deviceName": "Pixel 8", "appVersion": "1.0.0" }
```

`201` → `{ user, session: { accessToken, expiresAt }, client? }`

Erros: `400` (nome/email/telefone/senha inválidos), `409` (e-mail já cadastrado),
`429` (rate limit por IP) — ver **Limites**.

### Login — `POST /api/mobile/auth/login`

Mesmo formato; `200` com o mesmo envelope. E-mail ou senha incorretos → `401`
genérico (não revela qual falhou). **5 falhas na mesma conta em 15 min → `429
{"error": "...", "code": "rate_limited"}`** (bloqueio por conta).

`POST /api/mobile/auth/login` e `register` não exigem `Origin` nem cookie — são as
únicas rotas com isenção de CSRF por design (Bearer puro).

### Identidade — `GET /api/mobile/auth/me`

```http
GET /api/mobile/auth/me
Authorization: Bearer <accessToken>
```

`200` → `{ user, session: { expiresAt } }` — **agende o refresh proativo** com base
em `session.expiresAt` (não espere o 401).

### Refresh rotativo — `POST /api/mobile/auth/refresh`

```http
POST /api/mobile/auth/refresh
Authorization: Bearer <accessTokenAtual>
```

`200` → `{ user, session: { accessToken: <novo>, expiresAt } }`.

**Cada chamada rotaciona o token**: o token apresentado deixa de autenticar
imediatamente. Regras do lado servidor:

- O token antigo **nunca** pode ser reutilizado para autenticar (nas rotas de
  conta também).
- Se o token antigo for reapresentado **dentro de 60 s** (corrida de requests
  paralelos): `401 {"code":"token_rotated"}` — o sucessor continua válido; trate
  como corrida benigna, sem re-login.
- Se for reapresentado **depois de 60 s** (possível vazamento/replay): o servidor
  **revoga toda a cadeia móvel do usuário** e responde
  `401 {"code":"token_reuse"}` — o app deve forçar novo login.
- Sessão expirada → `401 {"code":"unauthenticated"}`.

**Recomendação para o app (Android):**

1. Refresh **single-flight** (uma única chamada em voo por vez, mutexo ou
   Mutex em memória/processo).
2. Persistir o novo `accessToken` no **Android Keystore** (via
   `androidx.security:security-crypto` / `EncryptedSharedPreferences`), nunca em
   `SharedPreferences` plano.
3. Agendar o refresh com antecedência (ex.: `expiresAt` − 5 min ou ao voltar de
   background), usando `session.expiresAt` do `/me`.
4. Em `401 token_reuse`: apagar o token local e voltar à tela de login.
5. Logout (`POST /api/mobile/auth/logout`) revoga **somente o token apresentado**.
6. Troca/reset de senha revoga **web + móvel** (comportamento existente no
   backend).

## Orçamentos consumindo o app

Ver `docs/CONTRATO_ORCAMENTOS.md` para o contrato completo (estados, transições,
erros, limites). Pontos de atenção para o cliente Android:

- Valores **sempre em centavos inteiros** (`priceCents`).
- Enviar `Idempotency-Key` (`[A-Za-z0-9_-]{8,200}`, ex.: UUID) em toda mutação
  (`budget-requests`, propostas, ações, favoritos). Retry de rede com a mesma
  chave devolve a resposta gravada com `Idempotency-Replayed: true` sem duplicar;
  chave reutilizada com outro conteúdo → `409 {"code":"idempotency_key_reuse"}`.
- 1 pedido ativo por par cliente/fotógrafo; proposta pendente única por pedido;
  aceite/rejeição controlados pelo servidor.

## Limites (por principal, por janela)

| Rota / operação | Limite |
|---|---|
| Login móvel | 10 / 15 min por rota+IP; **bloqueio por conta** após 5 falhas / 15 min → `429` |
| Cadastro móvel | 8 / 15 min por rota+IP |
| Refresh | 30 / 15 min |
| Solicitação de orçamento | 10 / h |
| Proposta | 20 / h |
| Favoritos | 30 / h |
| Contato / newsletter | por rota (ver `docs/RATE_LIMITING.md`) |

## Códigos de erro estáveis

Erros do contrato de orçamentos carregam `{ "error": "<humano>", "code": "<máquina>" }`:

`invalid_payload` (400), `unauthenticated` (401), `forbidden_role`,
`forbidden_own_profile`, `forbidden_not_owner`, `forbidden_not_participant` (403),
`not_found` (404), `invalid_state`, `conflict`, `idempotency_key_reuse` (409),
`rate_limited` (429).

Fluxo de refresh/login móvel:

`unauthenticated` (401, sem sessão / expirada), `token_rotated` (401, corrida
benigna), `token_reuse` (401, **revoga a cadeia** — forçar login),
`rate_limited` (429, bloqueio por conta ou excesso na rota).

## Armazenamento local e segurança (Android)

- `accessToken` **somente** no Android Keystore (`EncryptedSharedPreferences` ou
  chave dedicada). Nunca em texto puro, logs, analytics ou crash reports.
- `deviceName`/`appVersion` são persistidos nas sessões (`sessions.device_name`,
  `app_version`) exclusivamente para diagnóstico e auditoria — sem finalidade de
  rastreamento.
- O app **nunca** recebe o hash da sessão; nos logs do Worker o token nunca
  aparece (auditoria `mobile_auth_audit` grava apenas `event`, dispositivo e
  versão).

## Fluxo mínimo de referência

```
register/login → guardar accessToken (Keystore) + agendar refresh
→ GET /me (carregar perfil) → telas do app
→ ao agendar: POST /refresh (single-flight) → substituir token local
→ 401 token_reuse → limpar token → tela de login
→ logout → POST /logout → limpar token local
```

## Fora da versão 1 (adiado com risco aceito)

- Push notifications (não há push no backend).
- 2FA no app — projetado no ADR 002 (status Proposto; depende de aprovação do
  mantenedor). Quando aprovado, o login devolverá `202
  {"status":"twoFactorRequired","challengeToken":...}`.
