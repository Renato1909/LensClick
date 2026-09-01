# Roadmap Tecnico de Evolucao do LensClick

> **Premissa**: evoluir sem quebrar. Cada iniciativa e aditiva e reversivel. Nenhuma recomenda reescrita completa - o monolito atual e simples, testavel e adequado ao estadio do produto.
>
> **Arquitetura atual**: Worker unico Cloudflare (`src/worker.mjs`, handlers) com catalogo e despacho declarativos em `src/router.mjs` (22 padroes de rota e 25 contratos HTTP) - D1 `lensclick-db` (8 tabelas: `users`, `sessions`, `password_reset_tokens`, `contact_messages`, `newsletter_subscriptions`, `rate_limits`, `professional_profiles`, `portfolio_items`) - R2 `lensclick-profile-images` - Frontend HTML/JS/CSS vanilla (23 arquivos em `public/`) - suite automatizada de testes - Rate limiting hibrido (edge + politicas longas no D1) - `GET /api/health` para Worker/D1 - Sessoes por cookie (PBKDF2-SHA256, 100k iteracoes) - CSP rigorosa - Lazy loading nativo ja presente em `photographer-profile.js` (sem `srcset`/variantes) - Sem `sitemap.xml`, `robots.txt`, `caches.default`, OG/JSON-LD/meta description dinamica.
>
> **Agentes disponiveis**: Arquiteto de Software, Engenheiro Frontend, Engenheiro Backend, Engenheiro de Banco de Dados, Engenheiro DevOps, Engenheiro de QA, Designer, Especialista em Seguranca, Especialista em SEO e Performance, Especialista em Marketing para Fotografia, Revisor de Codigo.

---

## Fase 1 - Fundacao tecnica

> Melhorias necessarias **antes de crescer**: confiabilidade, observabilidade e bases de dados saudaveis. Sem estas, qualquer nova funcionalidade amplia debito tecnico.

### 1.1 Observabilidade e logs estruturados

> **Estado:** implementação concluída e validada em ambiente remoto controlado. O contrato, as evidências, as consultas e o procedimento de rollback estão em `docs/OBSERVABILIDADE.md`.

1. **Nome da iniciativa**: Observabilidade da edge - logs estruturados e metricas de requisicao.
2. **Objetivo**: Tornar todo erro e latencia visiveis em producao, sem depender de `console.error` textual.
3. **Problema resolvido**: O `catch` global usava `console.error` textual, sem correlacao por requisicao nem metricas de p95/latencia por rota. O modulo estruturado e o `X-Request-ID` eliminam esse diagnostico reativo e cego.
4. **Impacto esperado**: Reducao do MTTR (tempo de diagnostico) de horas para minutos; capacidade de detectar degradacao antes de usuarios reportarem; base para alertas.
5. **Complexidade**: Media - modulo isolado de observabilidade, integracao global no Worker, `X-Request-ID` e Workers Logs nativos.
6. **Riscos**: Volume de eventos e exposicao indevida de tokens/PII. Mitigacao: amostragem configuravel, rotas normalizadas e allowlist fechada de campos.
7. **Dependencias**: Nenhuma - pode ser feita isoladamente no `worker.mjs`.
8. **Agentes envolvidos**: Engenheiro DevOps, Engenheiro Backend, Especialista em Seguranca (revisao de sanitizacao).
9. **Ordem recomendada**: **1a** - e a base que habilita medir o impacto de tudo o que vem depois.

### 1.2 Suite de testes de regressao por rota

1. **Nome da iniciativa**: Cobertura de testes E2E por endpoint de API.
2. **Objetivo**: Garantir que toda rota de `/api/*` tenha teste de caminho feliz + caminho de erro + validacao de entrada, criando a rede de seguranca que habilita refatoracoes posteriores (incluindo a extracao do roteador no marco de transicao entre Fase 1 e Fase 2).
3. **Problema resolvido**: Hoje ha 14 arquivos de teste, mas o roteador e uma cadeia de `if (pathname === ...)` - adicionar rota nova sem teste e adicionar regressao silenciosa. Nao ha teste de contrato. A cadeia linear dificulta navegar e testar rotas isoladamente.
4. **Impacto esperado**: Confianca para refatorar (pre-requisitos das Fases 2-4); deteccao de regressao antes do deploy; base para a extracao do roteador no marco de transicao.
5. **Complexidade**: Baixa - usar `node --test` ja configurado; criar fixtures de D1 local alinhadas as migrations; testes de contrato por rota. A extracao do roteador em si nao faz parte desta iniciativa (ver marco de transicao).
6. **Riscos**: Falsos positivos se fixtures divergirem do schema real. Mitigacao: gerar fixtures a partir das migrations.
7. **Dependencias**: Nenhuma.
8. **Agentes envolvidos**: Engenheiro de QA, Engenheiro Backend, Arquiteto de Software (revisao da cobertura).
9. **Ordem recomendada**: **2a** - protege as refatoracoes subsequentes e habilita a extracao do roteador no marco de transicao entre Fase 1 e Fase 2.
10. **Subtarefas**:
    - 1.2.a: Cobertura de testes por rota (caminho feliz + erro + validacao de entrada).
    - 1.2.b: Testes de contrato por rota; fixtures alinhadas as migrations 0001-0004.

### 1.3 Migracao de rate limiting para Cloudflare Rate Limiting Rules

1. **Nome da iniciativa**: Rate limiting nativo da edge em vez de tabela D1.
2. **Objetivo**: Substituir `consumeRateLimit` (que faz `DELETE` + `INSERT ... ON CONFLICT` no D1 a cada requisicao sensivel) por regras nativas do Cloudflare.
3. **Problema resolvido**: Cada chamada a `isRateLimited` executa 2 queries D1 - em picos, isso satura o D1 e adiciona latencia. A tabela `rate_limits` cresce e precisa de limpeza manual (`DELETE WHERE expires_at <= ?`).
4. **Impacto esperado**: Reducao de latencia (~10-30ms por rota sensivel); menos carga no D1; sem tabela para limpar.
5. **Complexidade**: Media - configurar regras no dashboard/`wrangler.jsonc`; mapear cada `scope` atual para uma regra; manter fallback para rotas nao cobertas.
6. **Riscos**: Regras nativas sao por-IP/path - perde-se o escopo por email (`password-reset:email`). Mitigacao: manter rate limit por email no D1 apenas para reset de senha.
7. **Dependencias**: Nenhuma.
8. **Agentes envolvidos**: Engenheiro DevOps, Especialista em Seguranca, Engenheiro Backend.
9. **Ordem recomendada**: **3a** - alivia o D1 antes das otimizacoes de query da Fase 4.

### 1.4 Indices e health check do D1

1. **Nome da iniciativa**: Auditoria de indices e endpoint de health check.
2. **Objetivo**: Garantir que todas as queries de busca tenham indice suporte e expor `/api/health` para monitoramento.
3. **Problema resolvido**: A busca `/api/photographers` filtra por `state`, `city`, `specialty` (JSON), `availability` - o indice atual `idx_professional_profiles_published_location` cobre `(is_published, state, city)` mas nao `specialty` (armazenado como JSON). Busca por especialidade pode fazer full scan conforme o catalogo cresce. Nao ha health check para alertas.
4. **Impacto esperado**: Busca estavel em O(log n) mesmo com 10k+ perfis; alerta automatico se D1/R2 indisponiveis.
5. **Complexidade**: Baixa - migration `0005` adiciona indices; endpoint simples.
6. **Riscos**: Indices adicionam custo de escrita em inserts de perfil. Mitigacao: apenas indices justificados por queries reais.
7. **Dependencias**: Nenhuma.
8. **Agentes envolvidos**: Engenheiro de Banco de Dados, Engenheiro Backend.
9. **Ordem recomendada**: **4a** - barata e de alto valor antes do crescimento.

---

## Marco de transicao entre Fase 1 e Fase 2

Este marco nao e uma iniciativa numerada; e uma atividade estrutural executada uma unica vez, habilitada por 1.2 (cobertura de testes E2E por endpoint), que prepara o terreno para a modularizacao por dominio (4.2).

> **Status:** concluido pelo PR #34 e validado em producao em 25 de agosto de 2026. As quatro iniciativas da Fase 2 tambem foram concluidas; a proxima iniciativa e 3.1.

- **Objetivo**: Extrair o roteador de `worker.mjs` para `src/router.mjs` antes de iniciar a Fase 2.
- **O que executa**: **Etapa A (roteador)** - extrair `handleRequest`/`handleApi` para `src/router.mjs` como `Map` de handlers (ou estrutura equivalente); preservar comportamento; sem mudanca de logica de negocio.
- **Validacao**: rodar todos os testes (1.2) antes e depois da extracao; nenhum teste pode regredir.
- **Dependencias**: 1.2 (cobertura de testes E2E por endpoint).
- **Agentes envolvidos**: Arquiteto de Software, Engenheiro Backend, Revisor de Codigo.
- **Observacao**: esta e a unica execucao da Etapa A. A iniciativa 4.2 (Fase 4) nao repete a Etapa A; ela apenas executa a Etapa B (modularizacao por dominio) sobre o roteador ja extraido neste marco.

---

## Fase 2 - Melhorias de experiencia

> UX, conversao e ativacao. Foco em reduzir atrito para fotografos publicarem perfil e clientes encontrarem profissionais.

### 2.1 Onboarding guiado do fotografo

> **Status:** concluido pelo PR #36 e validado em producao em 25 de agosto de 2026. O wizard acessivel e bilingue salva os dados do rascunho pela API existente no D1; o `sessionStorage` guarda somente a etapa atual. A versao `8df9581d-5dc9-40b2-80c3-76b52e12865e` serve 100% do trafego, sem rollback no smoke inicial.

1. **Nome da iniciativa**: Wizard de criacao de perfil profissional em etapas.
2. **Objetivo**: Reduzir abandono no fluxo `cadastro -> perfil -> portfolio -> publicar`.
3. **Problema resolvido**: Antes, o fotografo preenchia um formulario unico extenso em `perfil.html`, sem indicador de progresso nem validacao contextual. O fluxo guiado agora esclarece o que falta e preserva perfis incompletos como rascunho (`is_published = 0`).
4. **Impacto esperado**: Aumento da taxa de perfis publicados; melhor qualidade de dados (menos campos vazios); melhor primeira impressao para clientes.
5. **Implementacao entregue**: Frontend vanilla dividido em etapas, sem framework; dados parciais persistidos pela API existente no D1 e numero da etapa mantido em `sessionStorage`.
6. **Risco residual**: A etapa atual e especifica da aba, mas nenhum dado profissional depende do `sessionStorage`; ao retomar, o wizard reconcilia a navegacao com o rascunho carregado do D1.
7. **Dependencias**: 1.2 (testes) para garantir que o PUT parcial continua funcionando.
8. **Agentes envolvidos**: Engenheiro Frontend (implementacao), Designer (interface/hierarquia visual), Especialista em Marketing para Fotografia (copy/jornada/proposta de valor), Engenheiro de QA.
9. **Ordem recomendada**: **5a** - apos a fundacao, e o maior ganho de conversao.
10. **Fronteira de responsabilidade**: Frontend=implementacao tecnica | Designer=interface e hierarquia visual | Marketing=copy, jornada e proposta de valor.

### 2.2 Busca com filtros avancados e ordenacao

> **Status:** concluido pelo PR #38 e validado em producao em 27 de agosto de 2026. A busca agora filtra preco minimo/maximo e raio minimo, ordena por recomendacao, preco, raio ou atualizacao e usa os indices da migration `0006`. A versao `ea2cfd01-fa8c-4770-b81d-9209fb2af021` serve 100% do trafego.

1. **Nome da iniciativa**: Filtros de preco, raio e ordenacao na busca.
2. **Objetivo**: Permitir clientes filtrarem por faixa de preco, ordenar por relevancia/distancia/avaliacao.
3. **Problema resolvido**: `search.js` enviava apenas `city`, `state`, `specialty`, `availability`. A entrega adicionou ordenacao, faixa de preco e uso do raio de servico (`service_radius_km`) na busca.
4. **Impacto esperado**: Resultados mais relevantes; maior taxa de contato; diferenciacao competitiva.
5. **Implementacao entregue**: Query params e clausulas SQL parametrizadas, ordenacao em allowlist, UI responsiva e bilingue, exibicao de preco/raio nos cards e limpeza dos filtros.
6. **Risco residual**: Distancia geografica real ainda depende de coordenadas, dados nao existentes; nao foi simulada. A ordenacao por avaliacao foi entregue na iniciativa 3.1. Os planos de preco e raio possuem testes com `EXPLAIN`.
7. **Dependencias**: 1.4 (indices), 1.2 (testes).
8. **Agentes envolvidos**: Engenheiro Backend, Engenheiro Frontend, Engenheiro de Banco de Dados, Especialista em Marketing para Fotografia (consultado sobre relevancia dos filtros para o cliente).
9. **Ordem recomendada**: **6a** - naturalmente apos onboarding (mais perfis publicados = mais valor na busca).

### 2.3 Galeria de portfolio com markup responsivo

> **Status:** concluido pelo PR #40 e validado em producao em 27 de agosto de 2026. A galeria responsiva e progressiva foi publicada na versao `24d21de1-bd1f-4450-b4a3-37bb09500890`, sem necessidade de rollback.

1. **Nome da iniciativa**: Galeria performatica com markup responsivo e carregamento progressivo.
2. **Objetivo**: Exibir portfolio (ate 12 itens, 4MB cada) com markup responsivo, dimensões explicitas e carregamento progressivo, preparando a interface para consumir variantes reais quando 4.3 estiver concluida.
3. **Problema resolvido**: A galeria usava apenas `loading="lazy"`, sem `srcset`/`sizes`, dimensoes explicitas, reserva de espaco, estado progressivo ou fallback visual de erro. A entrega corrige o markup e a experiencia responsiva; a reducao efetiva de banda com variantes reais permanece no escopo de 4.3.
4. **Impacto esperado**: LCP abaixo de 2.5s em mobile; CLS proximo de zero; menos banda consumida; melhor Core Web Vitals (indiretamente SEO); interface pronta para variantes reais (4.3).
5. **Implementacao entregue**: Lista acessivel, layout editorial responsivo, dimensoes explicitas, `sizes`/`srcset`, lazy loading assincrono, placeholder progressivo, transicao suave, fallback bilingue e respeito a `prefers-reduced-motion`.
6. **Risco residual**: Sem variantes reais, `srcset` aponta para a imagem original como solucao interina. A integracao completa e a reducao de banda serao finalizadas quando 4.3 estiver concluida.
7. **Dependencias**: Nenhuma critica. A integracao completa de `srcset` com variantes reais e finalizada quando 4.3 estiver concluida (dependencia unidirecional 4.3 -> 2.3, sem circularidade).
8. **Agentes envolvidos**: Engenheiro Frontend (implementacao), Especialista em SEO e Performance (Responsavel por Core Web Vitals/LCP/CLS/metricas), Engenheiro Backend.
9. **Ordem recomendada**: **7a** - ganho de UX e performance simultaneo.
10. **Fronteira de responsabilidade**: Frontend=markup responsivo, `srcset`/`sizes`, dimensoes explicitas, placeholders, estabilidade visual | SEO/Performance=metricas (LCP, CLS, Core Web Vitals) e definicao dos tamanhos otimos.
11. **Validacao realizada**: 131 testes, build do Wrangler, CI obrigatorio, revisao visual desktop/mobile, troca PT/EN e smoke de producao sem erros `5xx`.

### 2.4 Internacionalizacao real (i18n)

> **Status:** concluido pelo PR #42 e validado em producao em 28 de agosto de 2026. Os catalogos `pt-BR.json` e `en-US.json` possuem 500 chaves cada e sao carregados pelo runtime `public/lang.js`, com fallback progressivo, cache, interpolacao, persistencia de idioma e a transicao visual ja aprovada. A versao `a840abe4-6245-4616-8b06-1814587a7991` serve 100% do trafego, sem necessidade de rollback no smoke inicial.

1. **Nome da iniciativa**: Substituir `lang.js` por sistema de i18n com catalogos.
2. **Objetivo**: Suportar multiplos idiomas (pt-BR, en-US) sem duplicar HTML.
3. **Problema resolvido**: Os dicionarios viviam dentro de `lang.js`, misturando runtime e conteudo e tornando manutencao, fallback e expansao mais frageis. A entrega separou o conteudo por locale sem duplicar as paginas.
4. **Impacto esperado**: Base para expansao internacional; manutencao de copias centralizada.
5. **Implementacao entregue**: Catalogos JSON com paridade automatizada; helper `t(key, params, fallback)`; cache de requisicoes; fallback PT-BR e fallback progressivo do HTML; API `window.i18n`; textos dinamicos migrados; transicao acessivel preservada.
6. **Risco residual**: A traducao continua no cliente e pluralizacao avancada nao foi necessaria nesta etapa. Falhas de catalogo preservam o conteudo original em portugues e podem ser tentadas novamente.
7. **Dependencias**: 1.2 (testes de `html-scripts` e `translation-transition` ja existem).
8. **Agentes envolvidos**: Engenheiro Frontend, Designer, Especialista em Marketing para Fotografia (consultado sobre copias e tom por idioma).
9. **Ordem recomendada**: **8a** - pode ser adiada se expansao internacional nao for prioridade de curto prazo.
10. **Validacao realizada**: 134 testes, build do Wrangler, CI obrigatorio, revisao visual desktop/mobile, paginas legais e autenticacao em PT/EN, catálogos com 500 chaves cada e smoke de producao somente leitura sem erros `5xx`.

---

## Fase 3 - Crescimento do produto

> Marketplace, SEO e aquisicao. Funcionalidades que transformam o LensClick de diretorio em plataforma.

### 3.1 Sistema de avaliacoes e reputacao

> **Status:** concluido pelo PR #44 e validado em producao em 31 de agosto de 2026. A migration `0007` foi aplicada no D1 remoto e a versao `23d2a343-7bdf-4c86-b75f-482051ff514b` foi publicada com 138 testes aprovados.

1. **Nome da iniciativa**: Avaliacoes de clientes sobre fotografos.
2. **Objetivo**: Permitir que clientes logados deixem nota (1-5) e comentario apos contato confirmado.
3. **Problema resolvido**: Sem reputacao, a decisao de contratacao depende apenas do portfolio e preco - baixa conversao e sem diferencial competitivo entre profissionais.
4. **Impacto esperado**: Maior confianca; melhor ordenacao na busca (por avaliacao); engajamento de retorno de clientes.
5. **Implementacao entregue**: Tabelas `review_requests`, `reviews` e `review_audit`; solicitacao e confirmacao de contato; nota e comentario editaveis; exclusao logica; media e contagem publicas; ordenacao por reputacao; UI bilingue para os dois papeis.
6. **Risco residual**: A operacao de moderacao e o fluxo de contestacao dependem da definicao futura de um papel administrativo. A base de auditoria ja aceita eventos de moderacao; spam e fraude sao mitigados por sessao, contato confirmado, unicidade, papeis e rate limiting.
7. **Dependencias**: 1.2 (testes), 1.4 (indices para query de media por fotografo).
8. **Agentes envolvidos**: Engenheiro Backend, Engenheiro de Banco de Dados, Especialista em Seguranca (Responsavel por fraude, spam, abuso, manipulacao, rate limiting e controles antiavaliacao falsa), Engenheiro Frontend, Especialista em Marketing para Fotografia (Responsavel por apresentacao da reputacao, linguagem, percepcao de confianca, copy, conversao e comunicacao de avaliacoes ao fotografo e ao cliente).
9. **Ordem recomendada**: **9a** - e a funcionalidade de maior valor de marketplace, mas exige a fundacao pronta.
10. **Fronteira de responsabilidade**: Backend/DB=elegibilidade, persistencia, integridade, calculo das medias e regras tecnicas | Seguranca=fraude, spam, abuso, manipulacao, rate limiting, controles antiavaliacao falsa | Frontend=UI de avaliacao | Marketing=apresentacao da reputacao, linguagem, percepcao de confianca, copy, conversao e comunicacao de avaliacoes ao fotografo e ao cliente. As regras funcionais (quem pode avaliar, quando pode avaliar, criterios de moderacao, fluxos de contestacao) sao responsabilidade funcional a ser aprovada pelo Tech Lead/Arquiteto (nao ha agente de Analista de Requisitos/Produto listado no roadmap atual).

### 3.2 SEO tecnico: paginas de perfil indexaveis

> **Status:** concluido pelos PRs #47 e #48 e validado em producao em 31 de agosto de 2026. A versao `4346265f-e8b3-4c1e-b1c8-11ae43e8ce8d` foi publicada com 146 testes aprovados, sem migration ou alteracao de dados no D1.

1. **Nome da iniciativa**: Renderizacao server-side de perfis publicos para indexacao.
2. **Objetivo**: Que cada perfil publico (`/fotografo/:slug`) seja indexavel pelo Google com metadados ricos (Open Graph, JSON-LD).
3. **Problema resolvido**: A pagina publica era uma shell que carregava dados apenas via `fetch('/api/photographers/:slug')`; o HTML inicial nao continha o perfil para indexacao ou compartilhamento rico.
4. **Impacto esperado**: Trafego organico de long-tail ("fotografo de casamento em Sao Paulo"); CAC reduzido.
5. **Implementacao entregue**: Rota `/fotografo/:slug` atendida pelo Worker; consulta parametrizada somente a perfis publicados; HTML essencial com canonical, Open Graph e JSON-LD; hidratacao preservada; redirecionamento `301` da URL legada; `404` com `noindex`; cache publico de 60 segundos; normalizacao da rota nos logs.
6. **Risco residual**: O SSR e a hidratacao possuem responsabilidades parcialmente sobrepostas. A cobertura automatizada, o escaping centralizado e o smoke do HTML de origem reduzem o risco de divergencia e injecao.
7. **Dependencias**: 1.1 (observabilidade para medir indexacao).
8. **Agentes envolvidos**: Engenheiro Backend (Responsavel pela interceptacao da rota, consulta ao D1, geracao do HTML essencial, injecao de metadados, resposta HTTP, tratamento de erros, cache e seguranca do SSR), Engenheiro Frontend (Responsavel pela hidratacao, interatividade, consistencia visual, preservacao do conteudo essencial, prevencao de layout shift e comportamento progressivo caso o JavaScript falhe), Especialista em SEO e Performance (Responsavel por title, meta description tecnica, canonical, Open Graph, JSON-LD, indexabilidade, Core Web Vitals e validacao de conteudo servido ao crawler), Especialista em Marketing para Fotografia (Consultado sobre copy, proposta de valor, linguagem do snippet e mensagem exibida em compartilhamentos).
9. **Ordem recomendada**: **10a** - alto ROI de aquisicao, independe de avaliacoes.
10. **Fronteira de responsabilidade**: Backend=interceptacao da rota, consulta D1, geracao do HTML essencial, injecao de metadados, resposta HTTP, tratamento de erros, cache e seguranca do SSR | Frontend=hidratacao, interatividade, consistencia visual, preservacao do conteudo essencial, prevencao de layout shift, comportamento progressivo sem JS | SEO/Performance=title, meta description tecnica, canonical, OG, JSON-LD, indexabilidade, Core Web Vitals, validacao do conteudo servido ao crawler | Marketing (consultado)=copy, proposta de valor, linguagem do snippet, mensagem em compartilhamentos.

### 3.3 Mensagens entre cliente e fotografo

> **Status:** concluido pelos PRs #50 e #51 e validado em producao em 31 de agosto de 2026. A migration `0008` foi aplicada no D1 remoto e a versao `08aad6f9-b22b-4680-949d-279076e120e2` foi publicada com 154 testes aprovados.

1. **Nome da iniciativa**: Chat interno no lugar de `contact_messages` one-shot.
2. **Objetivo**: Permitir conversa persistente cliente-fotografo dentro do LensClick.
3. **Problema resolvido**: O formulario `/api/contact` criava um registro que o fotografo nao recebia nem respondia; agora clientes e profissionais possuem uma conversa privada e persistente dentro da conta.
4. **Impacto esperado**: Retencao; dados de conversao; oportunidade futura de comissao.
5. **Implementacao entregue**: Tabelas `conversations` e `messages`; cinco contratos autenticados; conversa unica por par; historico paginado; leitura e nao lidas; inbox responsiva; inicio no perfil publico; resposta na conta; UI bilingue e observabilidade normalizada.
6. **Risco residual**: Moderacao administrativa, notificacoes externas e encerramento manual permanecem futuros. Autorizacao por participante, rate limiting, limite de tamanho, escaping por `textContent` e cascatas de exclusao mitigam os riscos atuais.
7. **Dependencias**: 3.1 (reputacao) e recomendada antes para qualificar contatos; 1.1 (observabilidade) para monitorar volume.
8. **Agentes envolvidos**: Engenheiro Backend, Engenheiro de Banco de Dados, Engenheiro Frontend, Especialista em Seguranca, Especialista em Marketing para Fotografia (consultado sobre jornada de conversao e templates de mensagem).
9. **Ordem recomendada**: **11a** - e a funcionalidade que transforma diretorio em marketplace, mas e a mais complexa da Fase 3.

### 3.4 Sitemap dinamico e robots.txt

1. **Nome da iniciativa**: Sitemap.xml gerado dinamicamente a partir de perfis publicados.
2. **Objetivo**: Ajudar o Google a descobrir todos os perfis publicados.
3. **Problema resolvido**: Nao ha `sitemap.xml` nem `robots.txt` - a descoberta depende de crawling do HTML estatico.
4. **Impacto esperado**: Indexacao mais rapida e completa; complementa 3.2.
5. **Complexidade**: Baixa - rota `/sitemap.xml` que consulta perfis publicados e gera XML; `/robots.txt` estatico.
6. **Riscos**: Nenhum significativo.
7. **Dependencias**: 3.2 (SSR de perfis) para maximo efeito.
8. **Agentes envolvidos**: Engenheiro Backend, Engenheiro DevOps, Especialista em SEO e Performance (Responsavel por estrutura do sitemap e diretivas do robots.txt).
9. **Ordem recomendada**: **12a** - complemento barato de SEO, logo apos 3.2.

---

## Fase 4 - Escala

> Performance, observabilidade avancada e infraestrutura para suportar 10x o volume atual sem reescrever.

### 4.1 Cache de edge para buscas e perfis

1. **Nome da iniciativa**: Cache HTTP via Cache API do Cloudflare para GETs de leitura.
2. **Objetivo**: Servir `/api/photographers` e `/api/photographers/:slug` do cache da edge quando possivel.
3. **Problema resolvido**: Hoje toda busca hita o D1 - em escala, o D1 tem limite de throughput e latencia regional. O `Cache-Control: public, max-age=60` ja e enviado, mas nao ha `caches.default` no Worker para aproveita-lo.
4. **Impacto esperado**: Latencia de busca <50ms para cache hit; reducao de 80%+ de carga no D1 em paginas populares.
5. **Complexidade**: Media - usar `caches.default.put/get` com chave por query string; invalidacao ao atualizar perfil (cache tag ou TTL curto).
6. **Riscos**: Conteudo stale se a invalidacao falhar. Mitigacao: TTL de 60s (ja atual) + invalidacao ativa no PUT de perfil.
7. **Dependencias**: 1.3 (rate limiting fora do D1 libera headroom), 1.4 (indices).
8. **Agentes envolvidos**: Engenheiro Backend, Engenheiro DevOps, Especialista em SEO e Performance (consultado sobre TTL e impacto em conteudo stale para SEO).
9. **Ordem recomendada**: **13a** - so faz sentido quando ha volume para justificar.

### 4.2 Modularizacao do worker por dominio

1. **Nome da iniciativa**: Extrair handlers por dominio em modulos separados.
2. **Objetivo**: Reduzir o `worker.mjs` (926 linhas) dividindo-o em modulos por dominio (`src/auth.mjs`, `src/photographers.mjs`, `src/account.mjs`, `src/portfolio.mjs`), mantendo o roteador extraido no marco de transicao entre Fase 1 e Fase 2.
3. **Problema resolvido**: O `worker.mjs` cresceu para 926 linhas com 21 rotas em cadeia de `if` - dificil navegar, dificil testar isoladamente, risco de merge conflitos em equipe.
4. **Impacto esperado**: Manutenibilidade; onboarding de novos devs; testes isolados por modulo.
5. **Complexidade**: Media - extrair handlers por dominio preservando comportamento; depende do roteador extraido (marco de transicao entre Fase 1 e Fase 2).
6. **Riscos**: Regressao silenciosa se um handler nao for migrado. Mitigacao: validar todos os testes (1.2) antes e depois de cada extracao; preservar exports e contratos.
7. **Dependencias**: Marco de transicao entre Fase 1 e Fase 2 (roteador extraido em `src/router.mjs`); 1.2 (cobertura de testes E2E por endpoint para validar antes/depois).
8. **Agentes envolvidos**: Arquiteto de Software, Engenheiro Backend, Revisor de Codigo (Responsavel por garantir que a extracao preserva comportamento e contratos).
9. **Ordem recomendada**: **14a** - refatoracao estrutural, so apos a fundacao e quando o time sentir a dor.
10. **Etapas**:
    - **Etapa B (modularizacao por dominio)**: extrair handlers para `src/auth.mjs`, `src/photographers.mjs`, `src/account.mjs`, `src/portfolio.mjs`; cada modulo exporta seus handlers; o roteador (ja extraido no marco de transicao) apenas referencia os modulos; validar todos os testes (1.2) antes e depois de cada extracao; preservar exports e contratos.

### 4.3 Estrategia de imagens com R2 + Image Resizing

1. **Nome da iniciativa**: Geracao de variantes responsivas no upload.
2. **Objetivo**: Servir imagens de portfolio em tamanhos otimizados (thumbnail, medio, full) via R2 + Cloudflare Image Resizing, integrando-se ao markup preparado na 2.3.
3. **Problema resolvido**: Hoje a foto original (ate 4MB) e servida em qualquer contexto - galeria, card, perfil. Banda desperdicada e LCP degradado em mobile.
4. **Impacto esperado**: Reducao de 60-80% no peso de imagem por pagina; LCP consistente <2.5s.
5. **Complexidade**: Alta - integracao com Image Resizing (pago) ou pipeline de redimensionamento no upload via Workers; armazenar variantes no R2 com prefixo de chave; integracao final com o markup preparado na 2.3.
6. **Riscos**: Custo do Image Resizing; complexidade de invalidacao de variantes. Mitigacao: gerar 3 tamanhos fixos no upload, sem redimensionamento on-the-fly.
7. **Dependencias**: 2.3 (markup responsivo preparado) - a 4.3 consome a preparacao da 2.3, sem circularidade.
8. **Agentes envolvidos**: Engenheiro Backend, Engenheiro DevOps, Engenheiro Frontend, Especialista em SEO e Performance (Responsavel por tamanhos otimizados e Core Web Vitals).
9. **Ordem recomendada**: **15a** - so quando o volume de portfolios justificar o custo.
10. **Subtarefas**:
    - 4.3.a: Gerar thumbnails, variante media e variante completa no upload; armazenar no R2 com prefixo de chave.
    - 4.3.b: Adotar formatos modernos (WebP/AVIF) e compressao; definir politica de invalidacao de variantes.
    - 4.3.c: Integracao final com o markup `srcset`/`sizes` preparado na 2.3.

### 4.4 Alertas e SLOs

1. **Nome da iniciativa**: Definir SLOs e alertas automatizados.
2. **Objetivo**: Estabelecer metas (disponibilidade 99.9%, p95 <300ms para API, taxa de erro <0.1%) e alertar quando violadas.
3. **Problema resolvido**: Hoje nao ha SLO - degradacao so e percebida por reclamacao de usuario.
4. **Impacto esperado**: Deteccao proativa; base para decisoes de capacidade.
5. **Complexidade**: Media - depende de 1.1 (observabilidade); configurar alertas no Cloudflare Dashboard ou externo (Better Stack, Grafana).
6. **Riscos**: Alert fatigue se thresholds mal calibrados. Mitigacao: comecar conservador, ajustar com dados reais.
7. **Dependencias**: 1.1 (observabilidade) - **critica**.
8. **Agentes envolvidos**: Engenheiro DevOps, Arquiteto de Software, Especialista em SEO e Performance (Revisor de SLOs de Core Web Vitals e LCP).
9. **Ordem recomendada**: **16a** - fecha o ciclo: medir -> alertar -> evoluir.

---

## Recomendacoes arquiteturais transversais

Estas recomendacoes nao sao iniciativas pontuais, mas praticas continuas que devem acompanhar todas as fases. Elas sao pre-requisitos de qualidade e seguranca para qualquer evolucao do sistema.

### Seguranca

- **CSP (Content-Security-Policy)**: a CSP rigorosa ja existe no `worker.mjs`. Auditar sua eficacia; remover excecoes desnecessarias; garantir compatibilidade com SSR (3.2); evitar `unsafe-inline` para scripts; manter `style-src` controlado; documentar alteracoes; validar no ambiente de preview antes de producao.
- **HSTS**: habilitar `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` em todas as respostas.
- **Headers de seguranca**: padronizar `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal.
- **Sessoes**: revisar expiracao e rotacao de `sessions` (tabela ja existe); invalidar ao trocar senha; limite de sessoes ativas por usuario.
- **Cookies**: cookies de sessao com `Secure`, `HttpOnly`, `SameSite=Lax` (ou `Strict` se aplicavel); sem cookies cross-site desnecessarios.
- **Rotacao de segredos**: mapear todos os segredos (JWT secret, API keys, bindings) e definir rotacao periodica; nunca hardcoded no repositorio.
- **Auditoria periodica**: revisao trimestral de dependencias, permissoes de bindings (R2, D1) e superficie de ataque, conduzida pelo Especialista em Seguranca.

**Agentes envolvidos**: Especialista em Seguranca (Responsavel), Arquiteto de Software (Aprovador), Engenheiro Backend (Execucao), Engenheiro DevOps (Headers/infraestrutura).

### CI/CD

- **PRs obrigatorios**: nenhuma alteracao em `main` sem PR. Ja praticado - manter como regra inegociavel.
- **Validacoes automaticas no PR**: `npm test` (14 arquivos de teste), lint, verificacao de tipos/estrutura e build devem passar antes do merge.
- **Testes antes do deploy**: nenhuma iniciativa avanca para producao sem a suite de testes verde (1.2 e pre-requisito transversal).
- **Deploy automatizado Cloudflare**: manter o fluxo `branch -> PR -> CI -> merge -> deploy via Wrangler/GitHub Actions`. Evitar deploys manuais via `wrangler deploy` em `main`.
- **Ambiente de preview**: usar `wrangler pages dev` ou ambiente de preview do Cloudflare para validar PRs antes do merge em iniciativas de alto risco (3.1, 3.3, 4.3).

**Agentes envolvidos**: Engenheiro DevOps (Responsavel), Revisor de Codigo (Aprovador), Engenheiro de QA (Validacao), Arquiteto de Software (Aprovador arquitetural).

### Backup e recuperacao do D1

- **Backup**: configurar backup automatico do D1 (`wrangler d1 backup` ou export periodico) - o D1 nao garante backup automatico restauravel por padrao.
- **Restauracao**: documentar e testar o procedimento de restauracao do backup em ambiente isolado, nao em producao.
- **Validacao periodica**: a cada release maior (Fase 3 e 4), executar um restore de teste e validar integridade das 8 tabelas.
- **Retencao**: definir politica de retencao (minimo 30 dias de backups diarios) e local seguro de armazenamento (R2 separado ou storage externo).

**Agentes envolvidos**: Engenheiro de Banco de Dados (Responsavel), Engenheiro DevOps (Automacao), Especialista em Seguranca (Revisor de integridade).

---

## Resumo da ordem recomendada

| Ordem | Iniciativa | Fase | Complexidade |
|------:|------------|------|:---:|
| 1 | Observabilidade e logs estruturados | 1 | Media |
| 2 | Suite de testes de regressao por rota | 1 | Baixa |
| 3 | Rate limiting nativo da edge | 1 | Media |
| 4 | Indices e health check do D1 | 1 | Baixa |
| 5 | Onboarding guiado do fotografo | 2 | Media |
| 6 | Busca com filtros avancados | 2 | Media |
| 7 | Galeria de portfolio com markup responsivo | 2 | Media |
| 8 | Internacionalizacao real (i18n) | 2 | Media |
| 9 | Sistema de avaliacoes e reputacao | 3 | Alta |
| 10 | SEO tecnico: perfis indexaveis | 3 | Media |
| 11 | Mensagens entre cliente e fotografo | 3 | Alta |
| 12 | Sitemap dinamico e robots.txt | 3 | Baixa |
| 13 | Cache de edge para buscas e perfis | 4 | Media |
| 14 | Modularizacao do worker por dominio | 4 | Media |
| 15 | Estrategia de imagens com R2 + Image Resizing | 4 | Alta |
| 16 | Alertas e SLOs | 4 | Media |

---

## Principios de execucao

- **Nenhuma reescrita completa**: o monolito Workers + D1 + R2 e apropriado ao estadio. Crescer modularmente, nao trocar de stack.
- **Cada iniciativa e reversivel**: adicionar cache, indices, modulos - tudo pode ser desligado sem perda de dados.
- **Ordem nao e rigida dentro da fase**: as iniciativas de uma fase podem ser reordenadas conforme prioridade de produto, mas **a Fase 1 deve preceder as demais** - sem observabilidade e testes, evolucao e cega.
- **Gate de qualidade**: nenhuma iniciativa avanca sem que os testes de 1.2 passem e o deploy seja validado em producao (fluxo ja estabelecido: branch -> PR -> CI -> merge -> deploy).

Este roadmap e um documento vivo - deve ser revisado a cada trimestre conforme o produto e o catalogo de fotografos evoluirem.
