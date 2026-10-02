# ADR 001 — Autenticação Móvel: Bearer Opaco Revogável

- **Status:** Aceito (implementado) — pendências registradas abaixo
- **Data:** 02/10/2026
- **PR:** [#128 — feat: adicionar autenticacao movel revogavel](https://github.com/Renato1909/LensClick/pull/128) (mergeado em `de8d462`)
- **Relacionado:** `docs/PLANO_PR128_DETALHADO.pdf`, `docs/PLANO_ANDROID_VALIDACAO_PUBLICACAO.md`

## Contexto

O LensClick precisava de autenticação para o app Android (LensClickApp) sem cookies de navegador. O PR 128 introduziu login móvel com Bearer token opaco revogável, armazenado apenas como hash SHA-256 no D1.

## Decisão

| Ponto | Decisão | Justificativa |
|---|---|---|
| Formato do token | **Bearer opaco** (32 bytes aleatórios, base64url 43 chars) | Revogação instantânea server-side; sem chaves assimétricas para gerenciar; alinhado a RFC 9700 / OWASP MASVS |
| Alternativa rejeitada | JWT | Complexidade sem benefício: já existe D1, revogação é requisito, e o custo de lookup em `sessions` (índice em `token_hash`) é desprezível em Workers+D1 |
| Armazenamento | **Hash-only** SHA-256 (64 hex) na tabela `sessions` | Token nunca persiste em claro nem aparece em logs |
| Transporte | Só Bearer header; sem `Set-Cookie`; `Cache-Control: no-store` | Elimina CSRF por cookie nas rotas móveis |
| Limite de sessões | 5 ativas por usuário (compartilhado web+mobile neste slice) | MVP; poda por `expires_at DESC, created_at DESC` |
| Bypass de Origin | Restrito a `/api/mobile/auth/*` no `router.mjs` | Bearer puro não sofre CSRF; prefixo mínimo necessário |

## Riscos assumidos (próximos slices — NÃO esquecidos)

Decisões pendentes levantadas na revisão arquitetural do PR 128:

1. **🔴 Bypass de Origin por prefixo** — qualquer rota futura sob `/api/mobile/auth/*` herda a isenção silenciosamente. **Ação:** migrar para allowlist explícita de rotas no router.
2. **🔴 Cap de sessões compartilhado web/mobile** — 5 sessões via `user_id` misturam web e app; login no celular pode derrubar sessão do desktop. **Ação:** caps por família (ex.: 5 web + 3 mobile) ou coluna `kind` na tabela.
3. **🔴 Revogação em massa** — reset de senha / exclusão de conta devem revogar **todas** as sessões do usuário (mesma tabela hoje, mas confirmar cobertura em testes E2E).
4. **🟡 Refresh token com rotação + replay detection** — hoje o token tem vida fixa; expirar força novo login. Próximo slice Android precisa de refresh rotacionado, com revogação da cadeia em caso de reuso, e janela de tolerância para requests paralelos.
5. **🟡 Persistir `deviceName`/`appVersion`** — hoje são aceitos, ecoados e **descartados**. Ou persistir (listar/revogar por dispositivo) ou remover do contrato.
6. **🟡 Rate-limit por conta** — hoje é por rota+IP; força bruta distribuída contra uma conta segue viável. Considerar bloqueio por usuário após N falhas.
7. **🟡 Auditoria de sessões móveis** — eventos `mobile.auth.*` (login, revogação, reuso de refresh) sem logar token. Necessário antes da publicação na Play.
8. **🟢 `GET /me` deve devolver `expiresAt`** para o cliente agendar refresh proativo.
9. **🟢 Regex do Bearer aceita 40–200 chars** — confirmar que cabe o formato do futuro refresh token.

## Correções aplicadas no fechamento do PR

- Regex Bearer com escape duplo (`\\s` literal) corrigido — sem o fix, toda rota móvel retornava 401;
- `mobileLogout` limpo (variável morta, retorno `{ ok, revoked: Boolean }`);
- Manifestos de contrato atualizados: 43 rotas, 48 contratos, área `auth-mobile` na allowlist pública;
- Paridade de headers no contrato móvel: `x-content-type-options: nosniff`, `x-request-id` uuid, `no-store`.
- Suite: **217/217 passando**; CI verde (Testes e validação + Preview smoke).

## Próximo slice

Integração Android (Retrofit, Keystore), refresh/rotate com replay detection, 2FA multicliente — conforme `docs/PLANO_ANDROID_VALIDACAO_PUBLICACAO.md`. Revisitar itens 1–3 deste ADR **antes** de mergear o slice Android.
