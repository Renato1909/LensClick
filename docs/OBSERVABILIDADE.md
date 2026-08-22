# Observabilidade do LensClick

> Runbook da iniciativa 1.1. Registra o contrato dos eventos, a política de privacidade, as consultas e as evidências da validação remota concluída em 22 de agosto de 2026.

## 1. Arquitetura

O Worker emite objetos estruturados nos Workers Logs da Cloudflare, sem dependências externas. A instrumentação é best-effort: uma falha no destino dos logs nunca altera a resposta HTTP.

- `src/observability.mjs`: contexto, rota normalizada, classificação e emissão.
- `src/worker.mjs`: um contexto por requisição, `X-Request-ID` e duração total.
- `wrangler.jsonc`: Workers Logs habilitados e invocation logs automáticos desabilitados.
- `test/observability.test.mjs`: contrato, correlação, respostas e segurança.

Cada requisição produz exatamente um `http.request.completed`. Falhas operacionais específicas podem produzir um evento adicional sanitizado, sem substituir nem duplicar o principal.

## 2. Contrato dos eventos

| Campo | Tipo | Descrição |
|---|---|---|
| `schema_version` | número | Versão do contrato; atualmente `1`. |
| `event` | texto | Nome fixo do evento. |
| `level` | texto | `info` abaixo de 400, `warn` em 4xx e `error` em 5xx. |
| `request_id` | texto | UUID do servidor, também devolvido em `X-Request-ID`. |
| `method` | texto | Método HTTP normalizado. |
| `route` | texto | Rota normalizada e de baixa cardinalidade. |
| `status` | número | Status HTTP. |
| `outcome` | texto | `success`, `client_error` ou `server_error`. |
| `duration_ms` | número | Duração total em milissegundos. |
| `error_category` | texto | Categoria fixa e opcional. |

Rotas dinâmicas não preservam IDs, slugs, tokens ou query strings. Exemplos: `/api/photographers/:slug`, `/api/account/portfolio/:id` e `/api/unknown`.

Eventos operacionais adicionais permitidos:

- `email.password_reset.delivery_failed`;
- `storage.profile_picture.cleanup_failed`.

Eles contêm somente `schema_version`, `event`, `level`, `request_id` e `error_category`. As categorias permitidas são `validation_error`, `authentication_error`, `database_error`, `storage_error`, `email_delivery_error` e `unexpected_error`.

## 3. Privacidade e segurança

Os eventos usam allowlist fechada. Não são persistidos senhas, hashes, tokens, cookies, Authorization, chaves de API, dados pessoais, corpo da requisição, URL completa, query string, SQL, parâmetros SQL, chaves R2, objetos `Error`, mensagens brutas, stack, cause ou respostas integrais de serviços externos.

O `X-Request-ID` recebido do cliente é ignorado e um UUID novo é gerado no servidor. Esse identificador é apenas operacional e não concede acesso.

A Cloudflare pode anexar metadados próprios em `$workers` e `$metadata`; eles não são eventos personalizados adicionais. A validação confirmou que `invocation_logs: false` eliminou eventos automáticos separados do tipo `cf-worker-event`. O canário artificial enviado na query foi redigido pela plataforma e não ficou pesquisável.

## 4. Configuração Cloudflare

```jsonc
"observability": {
  "enabled": true,
  "logs": {
    "enabled": true,
    "invocation_logs": false,
    "head_sampling_rate": 1
  }
}
```

Tracing, Analytics Engine e Logpush permanecem desabilitados. A amostragem começa em `1` enquanto o volume é baixo; o consumo deve ser acompanhado antes de qualquer ajuste.

## 5. Consultas operacionais

No painel: **Workers & Pages → lensclick → Observability → Query Builder**.

- 5xx: `event = "http.request.completed" AND status >= 500`;
- correlação: filtrar pelo `request_id` do header da resposta;
- latência: `P95(duration_ms)` agrupado por `route`;
- falhas operacionais: filtrar pelo nome do evento.

Se o autocomplete não mostrar `route` ou `duration_ms`, informe os nomes manualmente. A API oficial confirmou o tipo numérico de `duration_ms`, o P95 e o agrupamento por `route`.

## 6. Evidências da validação remota

A candidata `596a920a-b1fd-4992-b9e3-678dcc0ec25c` foi executada somente por Version Override em deployment temporário 100/0. Nenhum tráfego normal chegou a ela.

| Requisição | Status | `request_id` |
|---|---:|---|
| `GET /` | 200 | `73d4055e-87be-4942-b5a8-7679ada1fc3a` |
| `GET /api/auth/me` sem sessão | 401 | `4e81c5f7-2089-470b-a5fc-406ced0e1a52` |
| `GET /api/unknown` | 404 | `665dd541-1a65-446d-972d-4eba06967434` |

Uma segunda requisição segura a `/` completou a amostra de quatro eventos. A API oficial confirmou:

- quatro `http.request.completed`, um por requisição e sem duplicação;
- quatro registros `cf-worker` e nenhum `cf-worker-event` separado;
- correlação entre `request_id` persistido e `X-Request-ID`;
- campos personalizados individualmente pesquisáveis;
- canário artificial ausente (`0` ocorrências);
- `duration_ms` numérico e P95 por rota funcional;
- P95 da amostra: `/` 295 ms (2 eventos), `/api/auth/me` 0 ms (1) e `/api/unknown` 0 ms (1).

A amostra prova o funcionamento da agregação, mas não representa a performance do produto.

## 7. Produção e rollback

Após a validação, o deployment `95869e43-5f1b-4ad0-8776-56a559f1f65b` manteve a versão estável `3d10ad69-e0e6-48f5-ae51-a796b5ad52c4` em 100%. A candidata não permaneceu no deployment atual.

O merge não publica automaticamente o Worker. A implantação definitiva exige PR aprovado, CI verde e confirmação operacional.

Em uma regressão futura:

1. identificar a versão estável anterior;
2. criar deployment com 100% nessa versão;
3. validar `/`, uma rota GET segura e os logs;
4. investigar a candidata somente após restaurar a produção.

O rollback não altera D1, R2, migrations ou dados de usuários.

## 8. Acompanhamento

- verificar 5xx e P95 por rota após publicações;
- monitorar volume diário, amostragem e custo;
- usar `request_id` em incidentes sem pedir credenciais;
- revisar retenção e amostragem trimestralmente;
- nunca copiar dados pessoais dos logs para issues ou PRs.
