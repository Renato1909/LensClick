# Índices e health check do D1

## Objetivo

A iniciativa 1.4 melhora os caminhos de leitura da busca pública e oferece um
sinal mínimo de disponibilidade do Worker e do D1, sem consultar dados de
usuários nem realizar operações no R2.

## Endpoint operacional

`GET /api/health` executa `SELECT 1 AS ok` pelo binding `DB`.

- `200`: `{ "status": "ok", "checks": { "database": "ok" } }`;
- `503`: `{ "status": "unavailable" }`;
- outros métodos: `404`, seguindo o contrato atual das rotas não suportadas.

A resposta usa `Cache-Control: no-store`, cabeçalhos de segurança e um
`X-Request-ID`. Falhas não expõem mensagem, stack, nome do banco ou detalhes do
provedor. Elas geram o evento operacional `database.health_check.failed`, com a
categoria fechada `database_error`, além do evento `http.request.completed`.

O R2 não faz parte desta sondagem. Consultá-lo em todo health check acrescentaria
operações de armazenamento e permitiria amplificação de custo em uma rota
pública. A saúde do R2 continua observada pelas rotas reais de imagem e seus logs.

## Migration 0005

`migrations/0005_search_indexes.sql`:

- remove `idx_professional_profiles_slug`, redundante com o índice automático da
  restrição `UNIQUE` de `slug`;
- adiciona `(is_published, updated_at DESC)` para a listagem padrão;
- adiciona `(is_published, state, updated_at DESC)` para o filtro por estado;
- adiciona `(is_published, availability, updated_at DESC)` para disponibilidade.

Os planos são verificados com `EXPLAIN QUERY PLAN`: os três caminhos usam seus
índices e deixam de criar uma B-tree temporária para a ordenação. O custo líquido
é de dois índices adicionais, porque um índice redundante é removido.

O filtro de cidade contém curinga inicial e o filtro de especialidade lê uma lista
JSON. Nenhum índice B-tree comum resolve esses dois casos. Normalizar
especialidades exige nova modelagem e fica explicitamente fora desta entrega.

## Publicação e rollback

Ordem segura de publicação:

1. executar a suíte automatizada e o deploy dry-run;
2. aplicar a migration `0005` no D1 remoto;
3. publicar o Worker;
4. confirmar `GET /api/health` com `200`;
5. validar busca padrão, por estado e por disponibilidade;
6. acompanhar `503`, `5xx` e `database.health_check.failed` nos logs.

O Worker anterior é compatível com os novos índices e pode ser restaurado sem
reverter o banco. Se for necessário remover os índices depois de aplicada a
migration, deve-se criar uma migration posterior; `0005` nunca deve ser editada.

## Monitoramento inicial

Uma sonda de baixo volume pode consultar o endpoint a cada 5 minutos. Recomenda-se
alertar somente após duas falhas consecutivas para evitar ruído transitório. Esta
entrega não cria serviço pago de monitoramento nem consulta automática ao R2.
