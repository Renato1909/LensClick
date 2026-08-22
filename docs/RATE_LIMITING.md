# Rate limiting do LensClick

## Objetivo

A iniciativa 1.3 adota o Rate Limiting API binding do Cloudflare Workers como escudo contra rajadas, sem enfraquecer as políticas de 15 minutos e 1 hora que já protegem as rotas sensíveis.

A migração é deliberadamente híbrida porque o binding nativo aceita somente períodos de 10 ou 60 segundos, opera por localidade da Cloudflare e possui consistência eventual. Ele é adequado para conter picos, mas não substitui sozinho os limites longos atuais.

Referências oficiais:

- [Rate Limiting API do Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Bindings suportados em desenvolvimento](https://developers.cloudflare.com/workers/local-development/bindings-per-env/)
- [Rate Limiting Rules do WAF](https://developers.cloudflare.com/waf/rate-limiting-rules/)

## Arquitetura

Cada requisição protegida percorre as camadas nesta ordem:

1. o Worker cria uma chave com projeto, rota e endereço do cliente;
2. a chave é transformada com SHA-256 antes de chegar ao binding nativo;
3. o binding aplica o limite de rajada de 60 segundos;
4. se a rajada for aceita, o D1 aplica a política longa existente;
5. somente então a rota processa o corpo e executa sua operação.

Quando o binding não existe ou apresenta falha, o Worker degrada para a política existente no D1. Uma indisponibilidade do escudo nativo não remove a proteção anterior.

## Bindings e políticas

| Binding | Limite nativo | Rotas protegidas | Política longa preservada no D1 |
|---|---:|---|---|
| `AUTH_RATE_LIMITER` | 10/min | cadastro, login, confirmação de reset e troca de senha | 8 ou 10 tentativas/15 min, conforme a rota |
| `SENSITIVE_RATE_LIMITER` | 5/min | solicitação de reset e exclusão de conta | 5 tentativas/1 h |
| `CONTENT_RATE_LIMITER` | 20/min | portfólio, contato e newsletter | 20 operações/1 h |
| `ACCOUNT_RATE_LIMITER` | 30/min | alteração do perfil profissional | 30 alterações/1 h |

Os `namespace_id` são exclusivos por binding. A chave também inclui o identificador `lensclick`, evitando interferência caso outro Worker da conta reutilize acidentalmente um namespace.

O limite adicional por e-mail da recuperação de senha continua exclusivamente no D1: 3 solicitações por e-mail a cada hora. O endereço não é enviado ao binding nativo.

## Privacidade e segurança

- O binding recebe apenas uma chave hexadecimal SHA-256; rota e endereço do cliente não são enviados em texto aberto como chave de contador.
- Os bindings não exigem token, segredo ou chave de API no código.
- Respostas bloqueadas continuam usando o contrato HTTP `429` já existente.
- A tabela `rate_limits` e a migration que a criou permanecem intactas nesta etapa.

## Observabilidade

Os bloqueios aparecem nos Workers Logs como eventos `http.request.completed`, com `status = 429`, rota normalizada e sem dados pessoais. O painel do Cloudflare não apresenta os contadores internos dos bindings; por isso a validação operacional usa os logs estruturados já implantados.

Consultas recomendadas:

- `status = 429` para volume total bloqueado;
- `status = 429 AND route = "/api/auth/login"` para tentativas de login;
- agrupar por `route` para identificar falso positivo ou abuso concentrado.

## Rollout e rollback

### Antes de publicar

1. executar a suíte automatizada completa;
2. validar `wrangler.jsonc` com deploy dry-run;
3. confirmar que os quatro bindings aparecem no resumo do Wrangler;
4. revisar que migrations e schema não foram alterados.

### Depois de publicar

1. executar smoke test funcional sem provocar bloqueios reais em contas de usuários;
2. confirmar respostas normais de cadastro/login e entradas públicas;
3. acompanhar erros e respostas `429` nos Workers Logs;
4. manter as duas camadas até existir evidência de produção suficiente para uma segunda etapa.

### Rollback

Reimplantar a versão anterior do Worker restaura imediatamente o comportamento somente-D1. Como nenhuma migration é modificada e a tabela permanece ativa, o rollback não exige operação no banco nem recuperação de dados.

## Limites desta etapa

- O binding é permissivo, eventualmente consistente e local ao ponto de presença da Cloudflare; não deve ser usado para contabilidade exata.
- O período nativo máximo atual é 60 segundos.
- O plano WAF gratuito oferece apenas uma regra e janela de 10 segundos, além de depender de uma zona/domínio; ele não substitui esta arquitetura no endereço `workers.dev` atual.
- A documentação oficial não apresenta uma cobrança separada por chamada ao binding; continuam aplicáveis os limites e preços normais do Worker e dos demais produtos utilizados.
- A remoção da tabela `rate_limits` fica fora desta etapa e exige uma decisão posterior baseada em métricas e em equivalência de segurança.
