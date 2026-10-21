# ADR 002 — Autenticação em Duas Etapas Multicliente (2FA)

- **Status:** Proposto — nenhuma implementação iniciada (Gate E do `docs/PLANO_ANDROID_VALIDACAO_PUBLICACAO.md`)
- **Data:** 16/10/2026
- **Iniciativa:** 6.3.1 (Fase 6.3 — produção multicliente)
- **Relacionado:** `docs/ADR_001_AUTENTICACAO_MOVEL.md` (Bearer opaco revogável, migration `0014_sessions_kind`), Decisões 9, 13, 17 e 18 de `docs/DECISOES_TECNICAS.md`

## 1. Contexto

A plataforma opera com senha única (PBKDF2-SHA-256, 100k iterações) como único fator para login web (cookie HttpOnly) e login móvel (Bearer opaco hash-only). Consequências:

- **Risco 1 do HANDOFF (crítico):** credenciais comprometidas dão acesso imediato à conta — leitura de perfil, portfólio, mensagens, alteração de senha e exportação LGPD de dados pessoais.
- O rate limiting atual (escudo nativo + políticas de 15 min/1 h em D1) mitiga força bruta automatizada por origem, mas não comprometimento de senha por vazamento de terceiros, phishing ou reuso.
- A verificação de e-mail existe em modo de aviso (Decisão 18) e não é fator de autenticação.
- O app Android compartilha a mesma conta de usuário; qualquer 2FA deve ser política única para web e app, sem duplicar estado de autenticação por interface.

O Gate E exige: threat model, comparação de opções e decisão técnica formal **antes** de qualquer implementação.

## 2. Threat model (resumo)

| Ameaça | Vetor | Mitigação existente | Mitigação proposta |
|---|---|---|---|
| Senha vazada de terceiros | login direto web/app | PBKDF2 + rate limit | Second factor obrigatório quando ativado |
| Phishing | captura de senha + código em tempo real | CSP estrita de scripts | TOTP: vitória parcial (código é phishável); passkeys: mitiga (futuro) |
| Furto de sessão ativa | cookie/token roubado | TTL 7 d, `no-store`, limite de sessões, revogação por famílias | Reativação de senha/desativação de 2FA revoga sessões (já garantido para reset) |
| Perda do dispositivo do 2FA | usuário sem gerador | — | Códigos de recuperação de uso único |
| Perda total (senha + 2FA) | lockout | — | Fluxo de recuperação sem bypass automatizado |
| Ataque às rota de desafio | brute force de códigos 6 dígitos | binding por rota/prefixo | Escopo dedicado por conta+IP + tentativas limitadas por desafio; expira o desafio em 5 min |
| Exposição do segredo no código/logs | observabilidade | sem segredos em logs (regra vigente) | Segredo TOTP nunca em resposta depois do enrollment; códigos de recuperação sempre hash |
| 2FA desativado socialmente | engenharia sobre suporte | painel admin não toca sessões | Admin revoga sessões e dispositivos confiáveis, nunca emite segredo |

Ameaças fora do escopo deste ADR: SIM swap (relevante apenas se e-mail virar fator), malware no dispositivo do usuário, coerção física.

## 3. Comparação de opções

| Opção | Forças | Fraquezas | Avaliação |
|---|---|---|---|
| **TOTP (RFC 6238)** | Offline, sem latência de terceiros, funciona idêntico em web e Android, amplamente suportado por apps autenticadores, implementável sem dependência nova (HMAC-SHA já usado via Web Crypto) | Segredo estático no servidor (incidente no D1 expõe segredos), phishável, sem proteção de MITM em tempo real | **Adotado** |
| Passkeys/WebAuthn | Resistente a phishing, sem segredo compartilhado, UX superior | WebAuthn no Android nativo exige FIDO2/Play Services e desenha um segundo fluxo completo; NENHUMA dependência de e-mail; maior esforço de implementação e suporte | **Evolução futura** (schema e contratos devem acomodá-la) |
| Código por e-mail (OTP via Brevo) | Sem dependência de app autenticador | Acoplado à entrega de e-mail (latência, spam, caixa fora do ar), mais fraco contra takeover da caixa; confunde com a verificação de e-mail de registro (Decisão 18) | **Rejeitado como fator primário** |
| Push approval (app adiciona aprovação) | UX forte | Exige canal ativo app↔server, torna o navegador dependente do app | Rejeitado no primeiro slice |

## 4. Decisão

| Ponto | Decisão | Justificativa |
|---|---|---|
| Fator | **TOTP + 10 códigos de recuperação de uso único** | Recomendação do Gate E; sem dependência de e-mail; paridade natural web/Android |
| Obrigatoriedade | **Opt-in na fase 1; obrigatório para `is_admin = 1` assim que dado o prazo de migração** | P5 prevê "2FA opcional"; administradores concentram poder de moderação (Decisões 19 e 20) |
| Segredos | Secret TOTP em `users` (colunas novas), códigos de recuperação apenas **SHA-256** | Consistente com hash-only de tokens/sessões; secret em claro é inevitável para computar códigos, então blindagem é processual (nunca logar, nunca retornar após confirmação) |
| Desafio no login | Login vira estado de duas fases: credenciais → challenge com TTL curto → código | Evita sessão válida antes do segundo fator |
| Dispositivo confiável | Cookie dedicado (HttpOnly/Secure/SameSite=Lax) com hash no D1 e expiração explícita de 90 dias, revogável | Evita re-desafio diário sem comprometer o fator |
| Reautenticação para gerir 2FA | Ativação e desativação exigem senha atual (+ código vigente para desativação) | ADR 001 risco 3 ampliado: desativar 2FA revoga **todas** as sessões web e móveis |
| Suporte admin | Admin **sem acesso ao segredo**: só lista dispositivos confiáveis, revoga sessões e força re-enrollment (novo enrollment válido substitui o anterior) | Gate E: "suporte administrativo sem acesso ao segredo" |
| Passkeys | Não implementadas agora; tabela de credenciais projetada para receber método futuro (`method` = `totp`, `webauthn`) | Evita segunda migração |
| Implementação TOTP | Implementação própria com Web Crypto (HMAC-SHA-1, janela ±1 passo), zero dependência | O runtime do Worker não oferece `node:crypto` completo; Web Crypto já é o padrão do projeto (Decisão 9) |
| QR code | Renderizado no cliente por SVG a partir do `otpauth://` servido **uma única vez** | CSP sem `'unsafe-inline'` em scripts: qualquer loader virá como asset externo ou SVG inline |

### Contratos previstos (novo catálogo)

| Rota | Autenticação | Efeito |
|---|---|---|
| `POST /api/account/2fa/enrollment` | sessão + senha atual | Emite secret + URL `otpauth` uma única vez; cria challenge de confirmação |
| `POST /api/account/2fa/confirm` | sessão + código TOTP | Ativa 2FA; **única** resposta contendo códigos de recuperação em claro |
| `POST /api/account/2fa/disable` | sessão + senha + código | Desativa 2FA, apaga segredo, revoga sessões e dispositivos confiáveis (auditado) |
| `POST /api/auth/2fa/verify` | challenge novo (cookie de 5 min na web / challenge token do login móvel) | Valida TOTP ou código de recuperação; emite sessão definitiva; marca dispositivo confiável se solicitado |
| `GET /api/account/2fa/status` | sessão | `{enabled, trustedDevices, recoveryCodesRemaining}` — sem segredos |
| `DELETE /api/account/2fa/trusted-devices/:id` | sessão | Revoga dispositivo confiável específico |

Estados de erro e anatomia de contrato seguem a suíte existente de contratos por rota; todas as rotas entram no catálogo do `src/router.mjs` e são cobertas por testes antes do merge (obrigatório pelo Gate C/F).

### Schema previsto (migration `0015_two_factor.sql`)

- `users.two_factor_secret` (TEXT, nulo por padrão), `users.two_factor_enabled_at` — **sem ALTER em migração publicada; tudo como migração nova**.
- `two_factor_recovery_codes` (`user_id`, `code_hash` SHA-256, `used_at`) — uso único confirmado por UPDATE condicional.
- `two_factor_trusted_devices` (`user_id`, `device_hash`, `created_at`, `expires_at`) — podado por expiração.
- `two_factor_audit` (`user_id`, `event`, `at`, `request_id`) — ativação, confirmação, desativação, desafio vencido, uso de código de recuperação, revogação; sem PII além do já praticado pela observabilidade vigente.

### Rate limiting

- Escopo dedicado no desafio: por **conta** (3 tentativas / 15 min) e por **origem** via binding nativo adicional (`TWOFA_RATE_LIMITER`, 5 req/60 s) — espelha a política do `AUTH_RATE_LIMITER` (Decisão de rate limiting híbrido vigente).
- Tentativa falida consome código de desafio: 5 falhas encerram o challenge e exigem novo login.
- Contas `is_admin`: janela do desafio mais estreita (2 tentativas / 15 min).

## 5. Experiência por interface

- **Web (cookie):** login → tela de desafio com campo de código (6 dígitos ou código de recuperação). `remember` cria dispositivo confiável de 90 dias. Sem re-desafio em refresh normal da sessão.
- **Android (Bearer):** `POST /api/mobile/auth/login` devolve `202 {status:"twoFactorRequired", challengeToken}` (5 min) → app coleta código → `POST /api/auth/2fa/verify` com `Authorization: Bearer challengeToken` → mesma resposta que login bem-sucedido + sessão móvel normal (próximo passo do ADR 001: refresh rotacionado é slice independente).
- **Recuperação:** exaustão dos códigos → contato via suporte institucional; NÃO há bypass automatizado nem elevação por e-mail (evita re-introduzir o fator rejeitado).
- **Migração de usuários existentes:** nenhuma conta nasce com 2FA; apelo na central da conta (banner por `window.i18n`, chaves `twoFactor.*` em PT/EN) e fluxo de enrollment opcional. Administradores terão janela definida antes da obrigação de 2FA.

## 6. Riscos assumidos e devemos revisitar

1. 🟡 **Secret em claro no D1** — incidente de banco requer rotação forçada de todos os segredos (procedimento de resposta não existe hoje; criar runbook padrão). Nota: hash do secret não é possível (é preciso computar códigos).
2. 🟡 **TOTP é phishável** — aceito na fase 1; passkeys na coluna de evolução devem reentrar em ADR próprio antes da publicação na Play (Gate I espera política final de 2FA).
3. 🟡 **Relógio do usuário** — janela ±1 passo atenua dessincronização; sem suporte a correção automática de drift no primeiro slice.
4. 🔴 **Login dois-fases muda contrato de login** — clientes existentes (web e app publicado) verão resposta diferente quando 2FA ativo; hidratação web e app devem receber feature flag em deploy (2FA tem que opt-in; contas sem 2FA jamais pegam `twoFactorRequired`).
5. 🟢 **Tabela de auditoria cresce indefinidamente** — poda periódica no cron existente (mesma janela do backup/monitor).

## 7. Ordem de execução do slice (futuro, não neste ADR)

1. Migration `0015` + `db/schema.ts` no mesmo PR (regra do projeto).
2. Módulo `src/twofactor.mjs` (enrollment, verificação, códigos, dispositivos) com handlers isolados.
3. Contratos no catálogo + testes por rota; E2E de três fluxos críticos (ativar, entrar com desafio, entrar com código de recuperação).
4. Página da central da conta (aba segurança) + tela de desafio pós-login; **i18n completa (os dois catálogos)** e tokens `--lc-*`.
5. App Android: tela de código e tratamento de `twoFactorRequired` (após Gate A/D — o projeto Kotlin ainda é externo à árvore).
6. Runbook de incidente de segredos + poda do audit no cron.

## 8. Critérios de aceitação para a implementação

- Nenhuma resposta de API contém secret TOTP, código de recuperação em claro ou `device_hash` completo depois de criados — confirmado por testes.
- Tabela `two_factor_audit` registra todos os eventos da seção 4 sem PII extra.
- A suíte de contratos inclui as rotas novas no catálogo vigente (48 contratos); CI "Qualidade" verde.
- Revogação em massa (desativação de 2FA) apaga sessões web **e** `kind='mobile'` — verificado por teste.
- Desafio expira em 5 min; estado pendente vive no D1 (durável), nunca em memória isolada do Worker.

## 9. Decisão revogável quando

- Incidente de segredos no D1 → rotação total + avaliação de passkeys antecipada;
- Gate D/F revelar que a paridade no app não será viável (improvável: TOTP é algoritmo puro);
- Uma decisão futura do Gate E demandar código por e-mail como fallback (reabrir ADR, não fazer ad-hoc).
