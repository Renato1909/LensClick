# Dependências e segurança do toolchain

## Objetivo

Manter a árvore de dependências do LensClick auditada, reprodutível e coerente com o risco real do projeto. Este documento registra a superfície de dependências, a política de atualização e o gate de auditoria no CI.

O LensClick é uma aplicação **serverless** com **zero dependências de runtime**. Todo o `npm` do projeto é toolchain de desenvolvimento. Isso muda radicalmente a leitura do `npm audit`: o relatório avalia um grafo de dependências Node que **não é publicado** e **não atende tráfego de produção**.

## Superfície de dependências

| Camada | Pacotes | Natureza |
|---|---|---|
| Runtime da aplicação | — | Nenhum. O Worker é publicado sem dependência de terceiros. |
| Publicação | `wrangler` | devDependency — empacota e publica o Worker |
| Testes | `@playwright/test` | devDependency — E2E em Chromium |
| Servidor local | `miniflare` → `workerd` | transitiva de `wrangler` — runtime do `wrangler dev --local` |
| Runtime local HTTP | `undici` | transitiva de `miniflare` — cliente HTTP do servidor local |
| Imagem local | `sharp` | transitiva de `miniflare` — emulação do binding `IMAGES` |

Invariantes verificadas e reproduzíveis:

```bash
npm ls --omit=dev --all     # => (empty)  — nenhuma dependência de runtime
```

- Todos os imports do entrypoint `src/worker.mjs` são **relativos** (`./router.mjs`, `./auth.mjs`, …). Não há specifier "bare" alcançável a partir do entrypoint.
- O bundle publicado (`dist/worker.js`, gerado por `npm run check`) **não contém** `undici`, `miniflare`, `sharp` nem `node_modules`.
- `package.json` declara apenas `devDependencies`. O lockfile marca todos os pacotes como `dev` ou `optional`.

## Estado em 2026-10-21

Antes da atualização, `npm audit` reportava **4 vulnerabilidades high**, todas na cadeia de ferramentas:

| Pacote | Versão | Advisory | Faixa afetada | Versão corrigida |
|---|---|---|---|---|
| `wrangler` | 4.118.0 | meta-vuln (cadeia) | `4.16.0 - 4.130.0` | ≥ 4.149.0 (ver abaixo) |
| `miniflare` | 5.20260730.0-alpha | meta-vuln (cadeia) | `… - 5.20260908.0-alpha` | ≥ 5.20260910.0-alpha |
| `undici` | 7.28.0 | 15 advisories (3 com CVSS 7.4–7.5), incluindo bypass de validação TLS e DoS | `7.0.0 - 7.29.0` | 7.29.1 |
| `sharp` | 0.35.2 | GHSA-rgj7-g3m4-5g8c (heap overflow em libheif) e GHSA-wq5f-xc86-pv6w (UAF em librsvg) | `<0.35.5` | 0.35.5 |

**A faixa sugerida pelo `npm audit` para o `wrangler` é enganosa.** O advisory meta marca `4.16.0 - 4.130.0` como afetado, mas a correção real depende das versões transitivas. Biseção da cadeia:

| `wrangler` | `miniflare` | `undici` | `sharp` | `npm audit` |
|---|---|---|---|---|
| 4.118.0 (anterior) | 5.20260730.0-alpha | 7.28.0 ❌ | 0.35.2 ❌ | 4 high |
| 4.130.0 | 5.20260908.0-alpha | 7.29.0 ❌ | 0.35.2 ❌ | 4 high |
| 4.131.0 | 5.20260910.0-alpha | 7.29.0 ❌ | 0.35.4 ❌ | 4 high |
| 4.143.1 | 5.20260926.1-alpha | 7.29.1 ✅ | 0.35.4 ❌ | 4 high |
| **4.149.0** | 5.20261006.1-alpha | 7.29.1 ✅ | 0.35.5 ✅ | **0** |
| **4.151.3** (adotado) | 5.20261019.1-beta | 7.29.1 ✅ | 0.35.5 ✅ | **0** |

O intervalo `4.119.0 → 4.151.3` do changelog oficial do `wrangler` **não contém nenhuma seção de breaking change, major change ou remoção** — apenas `Minor Changes` e `Patch Changes`.

## Avaliação de risco real

O `npm audit` reporta severidade canônica (uma aplicação Node que serve tráfego não confiável pela internet). No contexto real do LensClick, a reclassificação é:

| Pacote | Severidade canônica | Risco no LensClick | Condição de exploração |
|---|---|---|---|
| `sharp` | high | **Médio** | Dev ou CI processa imagem HEIC/SVG maliciosa pela emulação local do binding `IMAGES` → crash do processo local |
| `undici` | high | **Baixo** | Servidor local com proxy configurado; vetores em grande parte inaplicáveis ao fluxo do miniflare |
| `wrangler` / `miniflare` | high | **Baixo** | Marcadores de cadeia, sem advisory próprio |

- **Impacto em produção: nenhum.** Nenhum dos pacotes existe no bundle publicado, e o bundle gerado por 4.118.0 e por 4.151.3 é **byte-idêntico** (SHA-256 `FAF38EFE2E887E206FD62F3E0430C757786B3387555E62F8FE325C49DB538575`, 149 993 bytes, 146,48 KiB comprimido).
- **Impacto em dados de usuários: nenhum.** Não há caminho do código publicado até `undici`, `sharp` ou `miniflare`.
- **Não é zero.** Um desenvolvedor que exponha `wrangler dev --local` na rede local e processe uma imagem maliciosa pode derrubar o processo. O job `preview` do CI processa conteúdo do repositório: um `.heic` malicioso num PR seria um vetor de DoS no runner (efêmero e isolado, mas real).

## Decisão

Atualizar o lockfile para a versão do `wrangler` cujas dependências transitivas já estão corrigidas no upstream, **sem alterar o range declarado** (`wrangler: ^4.0.0` já permite 4.151.3) e **sem tocar em código de aplicação**.

| # | Alternativa | Veredito |
|---|---|---|
| **A** | Subir o lockfile (`npm audit fix` → wrangler 4.151.3) | ✅ **Adotada** — correção do upstream, sem passivo de manutenção, bundle inalterado |
| B | `overrides` forçando `undici@7.29.1` e `sharp@0.35.5`, mantendo wrangler 4.118.0 | ⚠️ Fallback válido, mas força combinação não testada pelo upstream e não traz o `workerd` corrigido |
| C | Aceitar o risco com justificativa | ❌ Sem ganho de segurança e cria passivo permanente |
| D | Remover o `wrangler` do `package.json` (instalar global / via `npx`) | ❌ Quebra a reprodutibilidade do CI e introduz risco de supply chain |

Também foi realinhada a allowlist `allowScripts` do `package.json`, que é o **controle de segurança** que restringe quais pacotes podem executar script de instalação:

```json
"allowScripts": {
  "esbuild@0.28.2": true,
  "workerd@1.20261019.1": true
}
```

O pin por versão exata é intencional — é o que impede um pacote futuro comprometido de executar script de instalação.

## Gate de auditoria no CI

| Workflow | Job | Comportamento | Justificativa |
|---|---|---|---|
| `quality.yml` | Testes e validação | **Informativo** (`continue-on-error`) | O `npm audit` consulta um serviço externo (registry); falhar o PR por indisponibilidade externa seria um falso bloqueio. O sinal fica visível no run. |
| `smoke-diario.yml` | Smoke diário | **Bloqueante** | O job diário já depende do registry (`npm ci`); a auditoria não introduz uma dependência externa nova. Falhar aqui é o sinal de que o lockfile derivou. |

Comando usado: `npm audit --audit-level=high`.

> `npm audit --omit=dev` seria **inútil** neste projeto: não há dependências de produção, então retornaria zero sempre. A auditoria relevante é a que inclui dev — que é exatamente onde mora o risco.

Para tornar o gate do PR bloqueante, remova `continue-on-error: true` do step em `quality.yml`.

## Evidências

| Verificação | Resultado |
|---|---|
| `npm audit` | `found 0 vulnerabilities` (exit 0) |
| `npm ci` (reinstalação limpa) | exit 0, sem aviso de `install-scripts` |
| `npm install-scripts ls` | `No packages with unreviewed install scripts.` |
| `npm ls wrangler miniflare undici sharp workerd esbuild` | 4.151.3 / 5.20261019.1-beta / 7.29.1 / 0.35.5 / 1.20261019.1 / 0.28.2 |
| `npm run check` | `Total Upload: 146.48 KiB / gzip: 30.31 KiB` — igual ao anterior |
| SHA-256 de `dist/worker.js` | `FAF38EFE2E887E206FD62F3E0430C757786B3387555E62F8FE325C49DB538575` — **byte-idêntico** ao anterior |
| `npm test` | 219/219 aprovados |
| `npm run lint` | nenhum problema no frontend |

## Riscos residuais

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | `workerd` local mais novo (1.20260730.1 → 1.20261019.1) altera o comportamento do `wrangler dev --local` | Baixa | Baixo | `compatibility_date` fixo em `2026-08-01`; job `preview` + smoke + E2E no CI cobrem |
| R2 | O `workerd` **já não executa nesta máquina Windows** (access violation `0xc0000005` no startup), **com 4.118.0 e com 4.151.3** — falha idêntica, pré-existente, **não é regressão do upgrade** | — | — | Validar `wrangler dev` e `d1 migrations apply --local` no CI (ubuntu-latest) ou em WSL/Docker. Não é validável localmente nesta máquina |
| R3 | Source maps passam a ser enviados por default no `wrangler deploy` (wrangler 4.150.0) | Alta | Baixo | O sourcemap fica no escopo da conta Cloudflare e **não é servido publicamente**; a Cloudflare já hospeda o código |
| R4 | Regressão silenciosa se o lockfile voltar a derivar | Média | Baixo | Gate de auditoria no job diário |
| R5 | Servidor local exposto na LAN + imagem maliciosa → DoS no dev | Baixa | Baixo | `wrangler dev` deve ouvir em `127.0.0.1`; não expor a porta 4174 |
| R6 | PR externo processado no job `preview` → DoS no runner | Muito baixa | Baixo | Repositório privado; runner é efêmero e isolado |

## Rollback

```bash
git revert <commit>          # restaura package.json e package-lock.json anteriores
npm ci
npm audit                   # deve voltar a reportar as 4 vulnerabilidades
```

Nenhuma mudança de schema, rota, binding ou artefato publicado precisa ser revertida: o bundle é byte-idêntico nas duas versões.

## Procedimento de atualização periódica

1. `npm outdated` para ver o que há de novo.
2. `npm audit fix` (sem `--force`; `--force` pode introduzir majors não testados).
3. Se o `package.json` precisar mudar (novo `allowScripts`), confirmar a versão exata instalada com `npm ls <pacote>`.
4. Reinstalação limpa: `rm -rf node_modules && npm ci`.
5. `npm audit` → esperar 0 vulnerabilidades; `npm install-scripts ls` → sem scripts não revisados.
6. `npm test`, `npm run lint`, `npm run check`.
7. Comparar o SHA-256 de `dist/worker.js` — **deve permanecer idêntico** enquanto nenhuma dependência de runtime entrar no bundle. Divergência significa que algo mudou no caminho de publicação e precisa de investigação.
8. Abrir PR com o resultado da auditoria e a comparação de hash.
