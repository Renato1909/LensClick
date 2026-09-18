# Roadmap Tecnico de Evolucao do LensClick

> **Premissa**: evoluir sem quebrar. Cada iniciativa e aditiva e reversivel. Nenhuma recomenda reescrita completa - o monolito atual e simples, testavel e adequado ao estadio do produto.
>
> **Arquitetura atual**: Worker unico Cloudflare (`src/worker.mjs` como ponto de composicao) com catalogo e despacho declarativos em `src/router.mjs` (37 rotas catalogadas) e handlers extraidos por dominio (`src/auth.mjs`, `src/photographers.mjs`, `src/account.mjs`, `src/account-security.mjs`, `src/portfolio.mjs`, `src/public-input.mjs`, `src/monitoring.mjs`) - D1 `lensclick-db` (15 tabelas: `users`, `sessions`, `password_reset_tokens`, `contact_messages`, `newsletter_subscriptions`, `rate_limits`, `professional_profiles`, `portfolio_items`, `review_requests`, `reviews`, `review_audit`, `conversations`, `messages`, `monitor_state`, `monitor_minute_buckets`) - R2 `lensclick-profile-images` (bucket privado) - Frontend HTML/JS/CSS vanilla - suite automatizada de testes (`node --test`; executar `npm test` para consultar o total atual) - Rate limiting hibrido (escudo de rajada nativo na edge + politicas longas autoritativas no D1) - `GET /api/health` para Worker/D1 - Sessoes por cookie (PBKDF2-SHA256, 100k iteracoes, maximo de 5 ativas por usuario) - HSTS sem `preload` e CSP sem `'unsafe-inline'` em `script-src` - variantes de imagem on-demand via binding `IMAGES` (Decisao 15) - sitemap/robots dinamicos - cache de edge de 60 segundos para descoberta publica - alertas in-worker de disponibilidade, P95 e taxa de 5xx (cron a cada 5 min) - Open Graph e JSON-LD presentes apenas nos perfis SSR (demais paginas tratadas na 5.8).
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

> **Status:** concluído pelos PRs #53, #54 e #55 e validado em produção em 1º de setembro de 2026. A versão `09def67b-f875-4384-9805-e839a7a718f7` está publicada com 157 testes aprovados.

1. **Nome da iniciativa**: Sitemap.xml gerado dinamicamente a partir de perfis publicados.
2. **Objetivo**: Ajudar o Google a descobrir todos os perfis publicados.
3. **Problema resolvido**: a descoberta dependia apenas do crawling do HTML estático, sem `sitemap.xml` nem `robots.txt` explícitos.
4. **Impacto esperado**: Indexacao mais rapida e completa; complementa 3.2.
5. **Implementação entregue**: rota `/sitemap.xml` consulta somente perfis publicados, gera XML com `<lastmod>` e limite de 50.000 URLs; `/robots.txt` define diretivas de rastreamento e aponta para o sitemap. Ambas aceitam `GET` e `HEAD`, com cache público de 1 hora.
6. **Riscos residuais**: o limite de 50.000 URLs atende o volume atual; crescimento além do limite exigirá sitemap index. O smoke de produção também levou aos PRs #54 e #55 para corrigir uma ambiguidade SQL e uma coluna inexistente na ordenação.
7. **Dependencias**: 3.2 (SSR de perfis) para maximo efeito.
8. **Agentes envolvidos**: Engenheiro Backend, Engenheiro DevOps, Especialista em SEO e Performance (Responsavel por estrutura do sitemap e diretivas do robots.txt).
9. **Ordem recomendada**: **12a** - complemento barato de SEO, logo apos 3.2.

---

## Fase 4 - Escala

> Performance, observabilidade avancada e infraestrutura para suportar 10x o volume atual sem reescrever.

### 4.1 Cache de edge para buscas e perfis

> **Status:** concluído pelo PR #57 e validado em produção em 1º de setembro de 2026. A versão `9f33b94f-92bf-439b-b4b1-465fdee65cc5` está publicada e a suíte conta com 159 testes aprovados.

1. **Nome da iniciativa**: Cache HTTP via Cache API do Cloudflare para GETs de leitura.
2. **Objetivo**: Servir `/api/photographers` e `/api/photographers/:slug` do cache da edge quando possivel.
3. **Problema resolvido**: toda busca e perfil público atingia o D1 mesmo quando a mesma leitura era repetida; o `Cache-Control: public, max-age=60` existia, mas `caches.default` ainda não era utilizado.
4. **Impacto esperado**: Latencia de busca <50ms para cache hit; reducao de 80%+ de carga no D1 em paginas populares.
5. **Implementação entregue**: `caches.default.match/put` no ponto de entrada do Worker, com chave pela URL completa, somente respostas `200` públicas e TTL de 60 segundos. Falhas do cache são best-effort e não alteram a resposta originada no D1.
6. **Riscos residuais**: dados públicos podem permanecer desatualizados por até 60 segundos após uma mutação. O TTL curto foi escolhido em vez de invalidadores por padrão, evitando inconsistência entre variantes de filtros; respostas privadas, `HEAD` e mutações não são cacheadas.
7. **Dependencias**: 1.3 (rate limiting fora do D1 libera headroom), 1.4 (indices).
8. **Agentes envolvidos**: Engenheiro Backend, Engenheiro DevOps, Especialista em SEO e Performance (consultado sobre TTL e impacto em conteudo stale para SEO).
9. **Ordem recomendada**: **13a** - so faz sentido quando ha volume para justificar.

### 4.2 Modularizacao do worker por dominio

> **Status:** implementação concluída e validada em produção em 1º de setembro de 2026. Todas as entregas foram publicadas com 159 testes aprovados — autenticação (PR #59), leituras públicas (PRs #61 e #63), demais handlers até a segurança da conta (#76, #77) — culminando no PR #82, que removeu os 22 blocos desabilitados herdados e deixou o `worker.mjs` com 782 linhas.

1. **Nome da iniciativa**: Extrair handlers por dominio em modulos separados.
2. **Objetivo**: Reduzir o `worker.mjs` (926 linhas) dividindo-o em modulos por dominio (`src/auth.mjs`, `src/photographers.mjs`, `src/account.mjs`, `src/portfolio.mjs`), mantendo o roteador extraido no marco de transicao entre Fase 1 e Fase 2.
3. **Problema resolvido**: o `worker.mjs` concentrava todos os domínios em uma cadeia extensa de `if`; todos os handlers de domínio agora possuem módulos próprios com dependências explícitas, e os blocos desabilitados herdados foram removidos.
4. **Impacto esperado**: Manutenibilidade; onboarding de novos devs; testes isolados por modulo.
5. **Complexidade**: Média — extração incremental por domínio, preservando comportamento e contratos; a primeira entrega de autenticação foi concluída sem alterações de API.
6. **Riscos**: regressão silenciosa se um handler não for migrado. Mitigação: validar todos os testes antes e depois de cada extração, manter dependências injetadas e preservar contratos.
7. **Dependencias**: Marco de transicao entre Fase 1 e Fase 2 (roteador extraido em `src/router.mjs`); 1.2 (cobertura de testes E2E por endpoint para validar antes/depois).
8. **Agentes envolvidos**: Arquiteto de Software, Engenheiro Backend, Revisor de Codigo (Responsavel por garantir que a extracao preserva comportamento e contratos).
9. **Ordem recomendada**: **14a** - refatoracao estrutural, so apos a fundacao e quando o time sentir a dor.
10. **Etapas**:
    - **Etapa A (concluída — autenticação)**: extrair cadastro, login, logout, sessão e recuperação para `src/auth.mjs`; validar contratos e publicar após CI.
    - **Etapa B (concluída)**: todos os handlers restantes foram extraídos — leituras e mutações de fotógrafos, review-requests e avaliações (`photographers.mjs`), conversas e listing de portfolio (`account.mjs`), mutações de portfolio (`portfolio.mjs`), entradas públicas (`public-input.mjs`) e segurança da conta (`account-security.mjs`); blocos desabilitados removidos no PR #82; exports e contratos preservados.

### 4.3 Estrategia de imagens com R2 + Image Resizing

> **Status:** implementação concluída e validada em CI em 1º de setembro de 2026, com abordagem adaptada: variantes geradas on-demand via binding `IMAGES` (Cloudflare Images) em vez de pipeline no upload — formalizada como Decisão 15 em `docs/DECISOES_TECNICAS.md`. Entregas: #78 (transformações opcionais), #79 (integração `srcset`), #80 (política de cache) e #84 (foto de perfil + centralização do helper). Publicada em produção na versão `e271e165-8768-461d-a746-f3b66587b4c5` em 1º de setembro de 2026.

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
    - 4.3.a (adaptada - Decisao 15): o original e armazenado no R2 e as variantes (320/640/1280, AVIF/WebP) sao geradas on-demand via binding `IMAGES`, com cache de borda; sem armazenamento extra de variantes.
    - 4.3.b (concluida): AVIF/WebP com quality 82 on-demand, `Vary: Accept` e invalidacao por versionamento de URL (`?v=updated_at`), sem purge.
    - 4.3.c (concluida): `srcset`/`sizes` na galeria publica (2.3), na central da conta, no avatar do perfil publico e nos cards da busca.

### 4.4 Alertas e SLOs

> **Status:** concluída. Disponibilidade (>= 99,9%) coberta desde 1º de setembro de 2026 por sonda in-worker (cron 5 min + e-mail Brevo após 2 falhas, cooldown 1h, migration `0009`). Em 3 de setembro de 2026 (PR #95), os sinais de P95 (< 300 ms) e taxa de 5xx (< 0,1%) passaram a ser cobertos in-worker também: histograma agregado por minuto (migration `0010`), alertas Brevo com cooldown por sinal e limiares conservadores — após constatar que o dashboard Cloudflare não oferece alertas nativos por threshold. Detalhes em `docs/OBSERVABILIDADE.md` seções 9.1 a 9.3.

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

## Fase 5 - Consolidacao e prontidao operacional

> As Fases 1 a 4 entregaram as 16 iniciativas previstas. Esta fase nao adiciona funcionalidade de produto: ela da sustentacao ao que ja existe - base documental confiavel, continuidade dos dados, endurecimento de seguranca e automacao do ciclo de entrega. As iniciativas sao aditivas e reversiveis, como nas fases anteriores.

### 5.1 Consolidacao documental

> **Estado:** concluída. O catálogo `db/schema.ts` está na versão 10 com as 15 tabelas reais, e os documentos permanentes foram reconciliados com a implementação e com as decisões registradas até a Decisão 16.

1. **Nome da iniciativa**: Sincronizar a documentacao permanente com o estado real do repositorio.
2. **Objetivo**: Restabelecer `docs/HANDOFF.md`, `docs/AI_CONTEXT.md`, `docs/CONTEXTO_PROJETO.md` e `db/schema.ts` como fontes confiaveis, eliminando as divergencias acumuladas entre o que a documentacao descreve e o que a implementacao prova.
3. **Problema resolvido**: a documentação e o catálogo TypeScript divergiam da implementação quanto ao schema, às decisões arquiteturais, ao histórico operacional e ao progresso da Fase 5. A consolidação restabeleceu as fontes de contexto antes das próximas iniciativas.
4. **Impacto esperado**: plano, priorizacao e execucao passam a partir de premissas verdadeiras; reduz o retrabalho de quem assume o projeto.
5. **Complexidade**: Baixa - somente documentacao e catalogo de esquema.
6. **Riscos**: novo desalinhamento futuro. Mitigacao: atualizar a documentacao no mesmo PR que altera comportamento, ja previsto na secao 7 do `AI_CONTEXT.md`; manter contagens mutaveis (total de testes, linhas de arquivo) fora dos documentos de baixa mutabilidade, como o proprio `AI_CONTEXT.md` recomenda na secao 13.
7. **Dependencias**: Nenhuma.
8. **Agentes envolvidos**: Arquiteto de Software (Aprovador), Revisor de Codigo (Revisao), Engenheiro de Banco de Dados (`db/schema.ts`).
9. **Ordem recomendada**: **17a** - e o pre-requisito das demais: planejar sobre documentacao falsa produz ordem errada.
10. **Subtarefas**:
    - 5.1.a (concluída): `docs/HANDOFF.md` reconciliado com a `main`, o histórico até o PR #101 e o estado real das iniciativas 5.1 e 5.2.
    - 5.1.b (concluída): `docs/AI_CONTEXT.md` atualizado para 16 decisões, 15 tabelas, 10 migrações e catálogo de schema sincronizado.
    - 5.1.c (concluída): `docs/CONTEXTO_PROJETO.md` atualizado com débitos e próximos passos vigentes.
    - 5.1.d (concluída): `db/schema.ts` sincronizado na versão 10, incluindo `monitor_state` e `monitor_minute_buckets`.

### 5.2 Backup e restauracao do D1

> **Estado:** concluída. O workflow `.github/workflows/backup.yml` exporta diariamente o D1 remoto para o R2 remoto, confirma a existência do objeto pela API e aplica retenção de 30 dias. A automação foi validada em 4 de setembro de 2026, a política foi formalizada como Decisão 16 e o restore isolado foi validado em 18 de setembro de 2026.

1. **Nome da iniciativa**: Backup automatico do D1 com restauracao testada.
2. **Objetivo**: Garantir que o banco possa ser recuperado, com politica explicita de frequencia, retencao e local de armazenamento.
3. **Problema resolvido**: faltava uma cópia SQL automatizada no R2 com retenção própria, complementar ao Time Travel nativo, e evidência de que o arquivo podia ser restaurado com integridade.
4. **Impacto esperado**: reduz o risco de perda de dados e remove a dependência crítica da automação de deploys (5.6). Exports diários não garantem perda zero.
5. **Complexidade**: Media - workflow agendado, exportacao via Wrangler e armazenamento em bucket R2 proprio.
6. **Riscos**: credencial com privilegio excessivo; backup nunca testado passa falsa sensacao de seguranca. Mitigacao: token com permissao minima (leitura no D1 e escrita apenas no bucket de backup), restore executado em ambiente isolado - nunca em producao - e procedimento documentado em `docs/BACKUP_D1.md`.
7. **Dependencias**: Nenhuma critica, mas deve preceder 5.6.
8. **Agentes envolvidos**: Engenheiro de Banco de Dados (Responsavel), Engenheiro DevOps (Automacao), Especialista em Seguranca (Revisor de integridade e de privilegios do token).
9. **Ordem recomendada**: **18a**.
10. **Subtarefas**:
    - 5.2.a (concluida e validada): workflow `.github/workflows/backup.yml` - execucao diaria as 03:17 UTC e `workflow_dispatch` com parametro de retencao, arquivando no R2 remoto em `lensclick-backups/daily/backup-<data>.sql`, confirmando a existência do objeto e aplicando retenção de 30 dias via API da Cloudflare. Evidência operacional: execução manual 33883526187, objeto `backup-20260904T142433Z.sql`, 15.662 bytes, sem acesso ao conteúdo.
    - 5.2.b (concluída): em 18 de setembro de 2026, o backup `backup-20260918T081321Z.sql` foi restaurado em D1 local isolado; 15 tabelas de negócio, integridade SQLite `ok` e 0 violações de chave estrangeira. Nenhum registro pessoal foi exibido, produção não foi tocada e os artefatos temporários foram removidos.
    - 5.2.c (concluída): política formalizada na Decisão 16 de `docs/DECISOES_TECNICAS.md`.

### 5.3 Endurecimento transversal de seguranca

> **Estado:** concluida e validada em producao em 18 de setembro de 2026 (PRs #104 e #105; versao `0b72f0b4-b525-4b20-bdc3-f474574851bd`).

1. **Nome da iniciativa**: HSTS, CSP sem `unsafe-inline` em scripts e limite de sessoes ativas.
2. **Objetivo**: Fechar os itens de seguranca que as recomendacoes transversais deste roadmap preveem e que seguem em aberto.
3. **Problema resolvido**: antes da iniciativa, `SECURITY_HEADERS` nao emitia `Strict-Transport-Security`; a CSP liberava `'unsafe-inline'` em `script-src`; cinco paginas mantinham JavaScript inline; e nao havia teto de sessoes simultaneas por usuario, embora a rotacao de sessao na troca de senha ja existisse em `src/account-security.mjs`.
4. **Impacto esperado**: reduz a superficie de XSS e de sequestro de sessao; impede downgrade para HTTP.
5. **Complexidade**: Media - exigiu externalizar os scripts das paginas inicial e de autenticacao, sincronizar cabecalhos dinamicos e estaticos e ampliar os testes de regressao.
6. **Riscos**: `preload` no HSTS e praticamente irreversivel por meses - nao adotar nesta entrega; CSP restritiva demais quebra o frontend. Mitigacao: manter `'unsafe-inline'` em `style-src` nesta etapa e validar em preview antes da producao.
7. **Dependencias**: Nenhuma.
8. **Agentes envolvidos**: Especialista em Seguranca (Responsavel), Engenheiro Front-end (externalizacao do script), Engenheiro DevOps (cabecalhos), Revisor de Codigo.
9. **Ordem recomendada**: **19a**.
10. **Subtarefas**:
    - 5.3.a (concluida): HSTS com `max-age=63072000; includeSubDomains`, sem `preload`, aplicado pelo Worker e por `public/_headers` aos assets estaticos.
    - 5.3.b (concluida): scripts inline das cinco paginas afetadas externalizados; `script-src` agora permite apenas `'self'`, enquanto `style-src` preserva temporariamente `'unsafe-inline'`.
    - 5.3.c (concluida): `createSession` limita cada usuario a 5 sessoes ativas, preserva a sessao nova e remove excedentes em batch atomico no D1.
11. **Evidencias**: suite com 185/185 testes, CI obrigatorio verde nos PRs #104 e #105, build do Wrangler aprovado e smoke de producao somente leitura com health/D1 `200`, paginas e scripts `200`, sessao anonima `401`, rota desconhecida `404`, HSTS/CSP confirmados e navegador sem erros de console. Nenhuma migration ou dado remoto do D1 foi alterado.

### 5.4 Verificacao de e-mail e papeis de autorizacao

> **Estado:** concluída. As subtarefas 5.4.a (verificação de e-mail), 5.4.b (papel administrativo) e 5.4.c (painel de moderação) estão concluídas e a Fase 5.4 está encerrada.

1. **Nome da iniciativa**: Confirmacao de e-mail no cadastro e papel administrativo para moderacao.
2. **Objetivo**: Reduzir abuso na criacao de contas e destravar a moderacao de avaliacoes e conversas.
3. **Problema resolvido**: contas podem ser criadas com e-mail nao verificado; e os riscos residuais das iniciativas 3.1 (avaliacoes) e 3.3 (conversas) dependem de um papel de moderador que nao existe - hoje `role` e dado de perfil, nao controle de acesso, como registra a secao "Decisoes que ainda precisam ser formalizadas" de `docs/DECISOES_TECNICAS.md`.
4. **Impacto esperado**: menos abuso e account takeover; viabiliza moderacao e encerramento manual de conversas.
5. **Complexidade**: Alta - novo fluxo de e-mail, novas rotas e novo modelo de autorizacao.
6. **Riscos**: enumeracao de e-mail no reenvio (usar resposta generica, como ja faz `passwordResetRequest`); lockout de usuario; privilegio acidental de administrador. Mitigacao: rate limiting no `SENSITIVE_RATE_LIMITER`, guard `requireAdmin` coberto por testes de contrato, e primeiro administrador atribuido por migration ou script pontual - nunca por endpoint aberto.
7. **Dependencias**: 5.3 (rate limiting e cabecalhos endurecidos reduzem abuso).
8. **Agentes envolvidos**: Especialista em Seguranca (Responsavel), Engenheiro Backend, Engenheiro Front-end, Arquiteto de Software (Aprovador do modelo de papeis).
9. **Ordem recomendada**: **20a**.
10. **Subtarefas**:
    - 5.4.a (concluída): tabela `email_verification_tokens` e coluna `email_verified_at` na migration `0011`, seguindo o padrao de `password_reset_tokens`; rotas `POST /api/auth/email/verify` e `POST /api/auth/email/resend`; login em modo de aviso formalizado na Decisão 18 (não bloqueia; expõe `emailVerified`).
    - 5.4.b (concluída): coluna `is_admin` na migration `0012` - o `CHECK` de `role` na migration `0001` é imutável - e guard `requireAdmin` no inicio de `dispatchApiRoute` para as rotas `admin.*`, com `GET /api/admin/overview` como base de leitura do painel.
    - 5.4.c (concluída): painel administrativo minimo (`public/admin.html` + `admin.js`, chaves `admin.*` em PT/EN) com `GET /api/admin/reviews` + `PUT /api/admin/reviews/:id` (moderate/restore com trilha em `review_audit`) e `GET /api/admin/conversations` + `PUT /api/admin/conversations/:id` (close/reopen; conversa encerrada bloqueia novas mensagens com `409`).

### 5.5 Portabilidade de dados do titular (LGPD)

> **Estado:** parcial. As divulgacoes de alta prioridade (PR #89), de media prioridade (PR #91) e as clausulas opcionais (PR #93) ja estao em producao.

1. **Nome da iniciativa**: Exportacao dos dados do usuario pela propria conta.
2. **Objetivo**: Atender ao direito de portabilidade do titular e fechar o ciclo das adequacoes legais.
3. **Problema resolvido**: nao existe endpoint de exportacao; resta tambem a revisao legal formal antes da publicacao comercial, declarada como proxima prioridade no `HANDOFF.md`.
4. **Impacto esperado**: conformidade com a LGPD e reducao de risco juridico na publicacao comercial.
5. **Complexidade**: Baixa - leitura das tabelas existentes, sem novo schema.
6. **Riscos**: vazamento de dados de terceiros, ja que as conversas tem dois participantes. Mitigacao: definir e documentar se a exportacao cobre apenas o lado do titular; rate limiting rigoroso; nunca incluir `password_hash`.
7. **Dependencias**: 5.4 (e-mail verificado reforca a titularidade da conta).
8. **Agentes envolvidos**: Especialista em Seguranca (Responsavel), Engenheiro Backend, Arquiteto de Software (Aprovador do escopo da exportacao).
9. **Ordem recomendada**: **21a**.
10. **Subtarefas**:
    - 5.5.a: `GET /api/account/export` autenticado, com `SENSITIVE_RATE_LIMITER`, em JSON, sem `password_hash` e sem binarios do R2.
    - 5.5.b: revisao legal formal dos Termos de Uso e da Politica de Privacidade - atividade externa ao codigo e condicao para a publicacao comercial.

### 5.6 Automacao da entrega

> **Estado:** não iniciada.

1. **Nome da iniciativa**: Ambiente de preview e deploy automatizado.
2. **Objetivo**: Sair do deploy manual via `wrangler deploy` sem abrir mao do gate de qualidade.
3. **Problema resolvido**: o unico workflow (`quality.yml`) valida, mas nao publica; nao ha validacao de PR em ambiente real, item que as recomendacoes transversais de CI/CD preveem para iniciativas de alto risco.
4. **Impacto esperado**: rastreabilidade entre commit e versao publicada; menos variabilidade manual no deploy.
5. **Complexidade**: Media.
6. **Riscos**: automatizar deploy sem backup amplia o raio de impacto de um erro. Mitigacao: depender de 5.2 e manter `npm run check` (dry-run) como gate obrigatorio do PR.
7. **Dependencias**: 5.2 (backup e restauracao) - **critica**.
8. **Agentes envolvidos**: Engenheiro DevOps (Responsavel), Engenheiro de QA (Validacao), Revisor de Codigo (Aprovador).
9. **Ordem recomendada**: **22a**.
10. **Subtarefas**:
    - 5.6.a: job de preview no CI subindo o Worker local e executando `npm run test:smoke` contra ele.
    - 5.6.b: workflow `deploy.yml` em `push` para `main`, apos o "Qualidade", usando `CLOUDFLARE_API_TOKEN`.

### 5.7 Qualidade e debitos tecnicos

> **Estado:** não iniciada.

1. **Nome da iniciativa**: Aliases visuais legados, lint e testes em navegador real.
2. **Objetivo**: Reduzir a divida tecnica declarada na secao 15 (Hotspots) do `docs/AI_CONTEXT.md`.
3. **Problema resolvido**: `--accent-1`, `--text`, `--radius` e `--shadow` seguem em uso - 24 ocorrencias somente de `--accent-1` em `public/index.html`; nao ha script de lint no `package.json`; e nao ha cobertura de interface em navegador ou dispositivo real.
4. **Impacto esperado**: tokens visuais com fonte unica; deteccao precoce de erros de sintaxe e de regressoes de interface.
5. **Complexidade**: Media.
6. **Riscos**: remover os aliases antes de substituir os usos quebra o visual. Mitigacao: substituir primeiro as ocorrencias e remover as declaracoes do `:root` de `public/refinements.css` por ultimo, em PR separado.
7. **Dependencias**: Nenhuma.
8. **Agentes envolvidos**: Designer (tokens), Engenheiro Front-end, Engenheiro de QA (testes de interface), Revisor de Codigo (lint).
9. **Ordem recomendada**: **23a**.
10. **Subtarefas**:
    - 5.7.a: migrar os usos dos aliases legados para os tokens `--lc-*` e remover as declaracoes temporarias.
    - 5.7.b: script de lint e sua inclusao no workflow "Qualidade".
    - 5.7.c: testes de interface em navegador real para os fluxos criticos (cadastro, publicacao de perfil e envio de mensagem).

### 5.8 Produto e presenca digital

> **Estado:** não iniciada. Itens de menor risco, que podem ser antecipados conforme a prioridade de produto.

1. **Nome da iniciativa**: Capa e categorias no portfolio, metadados sociais nas demais paginas e dominio proprio.
2. **Objetivo**: Fechar lacunas de produto e de descoberta identificadas apos a conclusao da Fase 4.
3. **Problema resolvido**: `portfolio_items` nao tem capa destacada nem categoria; Open Graph e JSON-LD existem apenas nos perfis SSR gerados em `src/worker.mjs`; e o site e servido em `*.workers.dev`, sem `routes` ou `custom_domain` em `wrangler.jsonc`.
4. **Impacto esperado**: melhor apresentacao do portfolio; indexacao e compartilhamento mais ricos; endereco proprio e remetente de e-mail no dominio.
5. **Complexidade**: Media.
6. **Riscos**: metadados inconsistentes com o conteudo real prejudicam indexacao. Mitigacao: como o conteudo dessas paginas e estatico, as tags podem ser fixas no HTML, sem SSR; validacao com o Especialista em SEO.
7. **Dependencias**: 5.3 para o dominio proprio, que habilita HSTS com `preload` no futuro.
8. **Agentes envolvidos**: Especialista em SEO e Performance (Responsavel), Engenheiro Front-end, Engenheiro Backend, Engenheiro DevOps (dominio e DNS), Designer (capa e categorias), Especialista em Marketing para Fotografia (copy dos metadados).
9. **Ordem recomendada**: **24a** - pode ser antecipada conforme a prioridade de produto.
10. **Subtarefas**:
    - 5.8.a: `is_cover` e `category` em `portfolio_items` via nova migration, garantindo um unico item de capa por usuario.
    - 5.8.b: Open Graph e JSON-LD (`WebSite` e `Organization`) nas paginas publicas que nao sao SSR.
    - 5.8.c: dominio proprio em `wrangler.jsonc`, com SPF, DKIM e DMARC, e remetente Brevo no dominio.

---

## Recomendacoes arquiteturais transversais

Estas recomendacoes nao sao iniciativas pontuais, mas praticas continuas que devem acompanhar todas as fases. Elas sao pre-requisitos de qualidade e seguranca para qualquer evolucao do sistema.

### Seguranca

- **CSP (Content-Security-Policy)**: `script-src` ja opera sem `'unsafe-inline'`; auditar continuamente sua eficacia, manter compatibilidade com SSR e tratar a remocao futura de `'unsafe-inline'` em `style-src` como entrega visual separada.
- **HSTS**: ativo com `Strict-Transport-Security: max-age=63072000; includeSubDomains` em respostas do Worker e assets estaticos. `preload` permanece deliberadamente fora do escopo enquanto nao houver dominio proprio e decisao especifica, pois sua reversao e lenta.
- **Headers de seguranca**: manter sincronizados `SECURITY_HEADERS` e `public/_headers`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` e `Permissions-Policy` minimal.
- **Sessoes**: revisar periodicamente o TTL de sete dias e o teto de cinco sessoes ativas; a troca de senha continua revogando as demais sessoes.
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

- **Backup**: cópias SQL no R2 complementam o Time Travel nativo do D1. Automação, restore isolado e política concluídos (5.2.a–5.2.c). Ver `docs/BACKUP_D1.md`.
- **Restauracao**: manter o procedimento testado exclusivamente em ambiente isolado; produção somente em incidente real.
- **Validacao periodica**: a cada release maior, executar um restore de teste em ambiente isolado e validar a integridade das 15 tabelas.
- **Retencao**: manter 30 dias de backups diários no bucket R2 separado `lensclick-backups`.

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
| 17 | Consolidacao documental | 5 | Baixa |
| 18 | Backup e restauracao do D1 | 5 | Media |
| 19 | Endurecimento transversal de seguranca | 5 | Media |
| 20 | Verificacao de e-mail e papeis de autorizacao | 5 | Alta |
| 21 | Portabilidade de dados do titular (LGPD) | 5 | Baixa |
| 22 | Automacao da entrega | 5 | Media |
| 23 | Qualidade e debitos tecnicos | 5 | Media |
| 24 | Produto e presenca digital | 5 | Media |

---

## Principios de execucao

- **Nenhuma reescrita completa**: o monolito Workers + D1 + R2 e apropriado ao estadio. Crescer modularmente, nao trocar de stack.
- **Cada iniciativa e reversivel**: adicionar cache, indices, modulos - tudo pode ser desligado sem perda de dados.
- **Ordem nao e rigida dentro da fase**: as iniciativas de uma fase podem ser reordenadas conforme prioridade de produto, mas **a Fase 1 deve preceder as demais** - sem observabilidade e testes, evolucao e cega.
- **Gate de qualidade**: nenhuma iniciativa avanca sem que os testes de 1.2 passem e o deploy seja validado em producao (fluxo ja estabelecido: branch -> PR -> CI -> merge -> deploy).

Este roadmap e um documento vivo - deve ser revisado a cada trimestre conforme o produto e o catalogo de fotografos evoluirem.
