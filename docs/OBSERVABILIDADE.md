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

Após o merge do PR #22, o deployment `4d1468b0-726d-4de6-a997-75fafd45a9e9` promoveu a versão validada `596a920a-b1fd-4992-b9e3-678dcc0ec25c` para 100% do tráfego. Os smoke tests de `/`, `/api/auth/me` e `/api/unknown` passaram, e cada request produziu exatamente um evento persistido com rota, status e `request_id` corretos.

A versão anterior `3d10ad69-e0e6-48f5-ae51-a796b5ad52c4` permanece identificada como rollback imediato.

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

## 9. SLOs e alertas da Fase 4.4

Os objetivos iniciais são avaliados sobre uma janela móvel de 30 dias, excluindo respostas 4xx causadas por entrada ou autenticação do usuário:

| Sinal | Objetivo | Alerta inicial |
|---|---:|---:|
| Disponibilidade das rotas HTTP | ≥ 99,9% | < 99,5% em 15 min |
| Latência P95 das rotas API | < 300 ms | ≥ 300 ms em 15 min |
| Taxa de respostas 5xx | < 0,1% | ≥ 0,5% em 10 min |

Consultas-base no Query Builder:

- disponibilidade: `event = "http.request.completed" AND status < 500`;
- latência: `event = "http.request.completed" AND route starts_with "/api/"` com `P95(duration_ms)` agrupado por `route`;
- erros: `event = "http.request.completed" AND status >= 500`.

Os limiares são deliberadamente conservadores para o baixo volume atual. Antes de automatizar notificações, coletar pelo menos sete dias de dados para calibrar falsos positivos. O alerta deve apontar para o runbook deste documento e incluir janela, rota e valor observado, nunca dados de usuários.

O painel de Workers Observability é a fonte operacional; a configuração de notificações é feita no dashboard da conta Cloudflare e não altera o Worker, D1 ou R2.

## 9.1 Automação in-repo (PR #87)

O sinal de disponibilidade (>= 99,9%) e coberto por uma sonda executada no proprio Worker:

- Cron a cada 5 minutos (`scheduled` handler em `src/worker.mjs`) executa a mesma checagem do endpoint `GET /api/health` (`SELECT 1` no D1).
- Apois **2 falhas consecutivas**, envia um e-mail operacional via Brevo citando janela, rota e valor observado e apontando para este runbook - nunca dados de usuarios.
- **Cooldown de 1 hora** entre e-mails evita alert fatigue.
- Estado duravel (contador de falhas consecutivas + timestamp do ultimo alerta) persistido na tabela `monitor_state` (migration `0009_monitor_state.sql`).
- Sem `env.BREVO_*` configurado, a sonda registra o estado mas nao envia e-mail (degradacao limpa, sem quebrar o Worker).

Os sinais de latencia P95 (< 300 ms) e taxa de 5xx (< 0,1%) permanecem no painel Workers Observability, com notificacoes configuradas no dashboard Cloudflare - nao alteram Worker, D1 ou R2.

## 9.2 Evidencias da validacao operacional (3 de setembro de 2026)

Verificacao pos-implementacao da Fase 4.4, sem alteracao de codigo:

| Item | Resultado | Evidencia |
|---|---|---|
| Cron de 5 minutos no repositorio | OK | `triggers.crons: ["*/5 * * * *"]` em `wrangler.jsonc` |
| Deploy ativo | OK | `wrangler deployments list`: versao `ba5d4dd3-70e1-4975-a128-b97526b8b157` em 100% do trafego desde 2026-09-01T23:03Z (mesma data do PR #87) |
| Segredos de producao | OK | `wrangler secret list` confirma `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` (valores nunca expostos) |
| Suite de testes | OK | 166/166 testes aprovados, incluindo `monitoring.test.mjs` (6/6) e `observability.test.mjs` (12/12) |
| Notificacoes de P95 e 5xx no dashboard | **Nao configuradas** | Verificacao manual em 2026-09-03: **Cloudflare Dashboard → Notifications** sem nenhuma notificacao cadastrada (lista vazia) |

Constatacao adicional: as notificacoes nativas da Cloudflare para Workers **nao oferecem alertas customizados por threshold de P95 ou taxa de 5xx por rota**. A premissa original do roadmap (alertas desses sinais via dashboard) nao e suportada nativamente pela plataforma.

Decisao tomada em 2026-09-03: estender a sonda in-worker (`src/monitoring.mjs`) para cobrir P95 e taxa de 5xx com alertas via Brevo, seguindo o mesmo padrao da sonda de disponibilidade (tabela `monitor_state`, cooldown, e-mail operacional sanitizado). Isso mantem toda a configuracao de alertas versionada no repositorio (GitOps) e elimina a dependencia de configuracao manual no dashboard.

## 9.3 Alertas in-worker de P95 e 5xx (implementado em 3 de setembro de 2026)

Os tres sinais dos SLOs agora sao cobertos por sondas in-worker, sem dependencia do dashboard:

- **Amostragem**: cada requisicao registra um contador agregado por minuto na tabela `monitor_minute_buckets` (migration `0010`), via `context.waitUntil` - fora do caminho critico e best-effort. A tabela guarda somente contadores (total, 5xx, histograma de latencia das rotas `/api/*`); nenhum dado de usuario e persistido. Buckets com mais de 24h sao removidos pelo proprio cron.
- **P95**: a cada 5 min, o cron agrega os ultimos 15 minutos e calcula o P95 aproximado pelo histograma. A funcao retorna a fronteira superior do bucket; como 300 ms e fronteira do bucket `lt300` (amostras de 100-299 ms), o alerta usa comparacao estrita e dispara apenas quando o P95 cai em `lt500` ou acima - eliminando falso positivo na fronteira. Minimo de 10 amostras na janela.
- **Taxa de 5xx**: a cada 5 min, o cron agrega os ultimos 10 minutos. O SLO e < 0,1%, mas o alerta dispara no limiar conservador de >= 0,5% (conforme tabela da secao 9), com no minimo 20 requisicoes na janela (evita falso positivo em volume baixo). O e-mail cita SLO e limiar de alerta explicitamente.
- **Cooldown**: 1 hora por sinal (`probe:last_p95_alert_at`, `probe:last_5xx_alert_at` em `monitor_state`), independente do cooldown de disponibilidade.
- **E-mail**: mesmo canal Brevo, mensagem operacional com janela, valor observado e link para este runbook - nunca dados de usuarios. Sem `BREVO_*` configurado, o estado e registrado sem envio (degradacao limpa).
- **Custo**: 1 escrita pequena por requisicao no D1; leitura de poucas linhas a cada 5 min. Compativel com o volume atual; revisar se o trafego crescer ordens de magnitude.

### Evidencias do deploy (3 de setembro de 2026)

- PR #95 mergeado com CI verde; versao `9c72c288-4169-44e3-9084-665880a0dc26` em 100% do trafego com cron `*/5 * * * *`.
- Migration `0010` aplicada no D1 remoto antes do deploy.
- Smoke tests pos-deploy: `GET /api/health` 200 e `GET /` 200.
- Amostragem confirmada em producao: `monitor_minute_buckets` ja registra buckets com as requisicoes reais minutos apos o deploy.
