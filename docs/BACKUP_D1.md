# Backup e restauração do D1

> Iniciativa **5.2** do `docs/ROADMAP_EVOLUCAO.md`.
> Implementado pelo workflow `.github/workflows/backup.yml`.

---

## 1. Por que existe

O D1 **não garante backup restaurável por padrão**. Antes desta iniciativa, o repositório não tinha nenhuma automação de backup: `scripts/` continha apenas o smoke HTTP e dois builds de documentação, e o único workflow era o "Qualidade", que valida mas não preserva dados.

As recomendações arquiteturais transversais do roadmap pediam quatro coisas — backup, procedimento de restauração, validação periódica e política de retenção. Este documento cobre as quatro.

---

## 2. O que é feito

| Aspecto | Definição |
|---|---|
| **Frequência** | diária, às 03:17 UTC (`cron: 17 3 * * *`) |
| **Disparo manual** | `workflow_dispatch`, com parâmetro `retention_days` |
| **Origem** | banco remoto `lensclick-db` |
| **Destino** | bucket R2 `lensclick-backups`, prefixo `daily/` |
| **Formato** | `backup-YYYYMMDDTHHMMSSZ.sql` (schema + dados) |
| **Retenção** | 30 dias por padrão, configurável por execução |
| **Duração máxima** | 20 minutos |

O horário foge deliberadamente do minuto exato para não concorrer com outras execuções agendadas na plataforma.

### Verificações executadas pelo workflow

- falha imediatamente se `CLOUDFLARE_API_TOKEN` ou `CLOUDFLARE_ACCOUNT_ID` não estiverem configurados;
- **falha se o arquivo exportado estiver vazio** — um backup de 0 bytes arquivado seria pior que nenhum, porque passaria falsa sensação de segurança;
- confirma pela API da Cloudflare que o objeto recém-enviado existe no bucket R2 remoto, sem baixar nem inspecionar seu conteúdo;
- calcula a retenção pela data do nome `backup-YYYYMMDDTHHMMSSZ.sql`, sem depender de metadados opcionais da API, e ignora objetos fora desse padrão;
- a concorrência usa `cancel-in-progress: false`: um backup em andamento nunca é interrompido no meio, o que evita deixar um arquivo parcial no R2.

---

## 3. Configuração obrigatória (manual, única vez)

O workflow foi desenhado para exigir **o mínimo possível de configuração manual**. Das três etapas originalmente previstas, duas passaram a ser feitas pelo próprio workflow:

| Etapa | Quem executa |
|---|---|
| Criar o bucket `lensclick-backups` | **o workflow** — tenta criar e tolera a existência prévia |
| Resolver o account ID | **o workflow** — deriva do token quando o segredo opcional não está definido |
| Criar e registrar o token da Cloudflare | **o mantenedor** — exige login no painel da Cloudflare |

### 3.1 Criar o token e registrar o segredo — a única etapa obrigatória

Crie um token de API na Cloudflare com **permissão mínima**:

- edição no D1 (`D1 Edit`) para `lensclick-db`, necessária porque a API de exportação usa uma operação `POST`;
- leitura e escrita no R2, de preferência restrita ao bucket `lensclick-backups`. (A criação automática do bucket exige permissão de criação no R2 da conta; se o token não a tiver, use a etapa 3.2 para criar o bucket antes.);
- leitura de account, necessária para resolver o ID da conta.

Depois registre **um único segredo** no repositório:

```bash
gh secret set CLOUDFLARE_API_TOKEN
```

> ⚠️ Nunca commite esse valor. O workflow lê apenas de `secrets.*`.

### 3.2 Etapas opcionais

**Pré-criar o bucket** — recomendado quando o token tem permissão restrita e não pode criar buckets:

```bash
npx wrangler r2 bucket create lensclick-backups
```

O bucket é **separado** do bucket de imagens (`lensclick-profile-images`), como recomenda o roadmap, para que um erro de retenção ou de permissão em um não afete o outro.

Ele **não é declarado em `wrangler.jsonc`** de propósito: o Worker não precisa acessar os backups, e não criar o binding mantém o princípio do menor privilégio.

**Fixar o account ID** — opcional, mas recomendado em contas com múltiplas organizações, onde a resolução automática poderia escolher a conta errada:

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID
```

---

## 4. Execução manual

```bash
gh workflow run backup.yml                          # usa a retenção padrão de 30 dias
gh workflow run backup.yml -f retention_days=7      # retenção customizada
gh run watch                                        # acompanha a execução
```

---

## 5. Restauração

> 🔴 **Nunca execute uma restauração contra produção como teste.** O procedimento abaixo usa banco local. A restauração em produção só deve ocorrer em incidente real, com ciência de que ela **substitui o estado atual**.

### 5.1 Baixar o backup

```bash
npx wrangler r2 object get lensclick-backups/daily/backup-20260903T031700Z.sql \
  --remote \
  --file restore.sql
```

### 5.2 Conferir o conteúdo antes de aplicar

```bash
wc -c restore.sql
grep -c "CREATE TABLE" restore.sql        # esperado: 15 tabelas
grep -o "CREATE TABLE [a-z_]*" restore.sql | sort
```

### 5.3 Restaurar em ambiente isolado (teste)

```bash
npx wrangler d1 execute lensclick-db --local --file restore.sql -y
```

Isso aplica o dump no banco local usado pelo `wrangler dev`, sem tocar em produção. É o procedimento da **validação periódica**.

### 5.4 Restaurar em produção (somente em incidente real)

```bash
npx wrangler d1 execute lensclick-db --remote --file restore.sql -y
```

Como o dump contém `CREATE TABLE` e inserções, avalie antes se o banco de destino deve estar vazio; em caso de dúvida, pare, exporte o estado atual e só então prossiga.

---

## 6. Validação periódica

A cada release maior — e no mínimo trimestralmente — execute um restore de teste (seção 5.3) e confirme a integridade das **15 tabelas**:

`users`, `sessions`, `password_reset_tokens`, `contact_messages`, `newsletter_subscriptions`, `rate_limits`, `professional_profiles`, `portfolio_items`, `review_requests`, `reviews`, `review_audit`, `conversations`, `messages`, `monitor_state`, `monitor_minute_buckets`.

Registre a evidência no PR ou na issue do trimestre. **Backup nunca testado é backup presumido**, não backup verificado.

---

## 7. Segurança e privacidade

O dump contém **dados pessoais** — e-mails, telefones, mensagens privadas entre cliente e fotógrafo e avaliações. Por isso:

- o bucket `lensclick-backups` é **privado**, sem acesso público e sem binding no Worker;
- o token é restrito a um único bucket;
- a retenção de 30 dias limita a janela de exposição, em linha com a política de retenção por categoria já documentada na Política de Privacidade (PR #91);
- o workflow usa `permissions: contents: read`, o mínimo necessário.

---

## 8. Desativação e rollback

A iniciativa é **reversível**, como todas as do roadmap. Para desativar: desabilite o workflow em *Actions → Backup do D1 → Disable workflow*. Nenhum dado é alterado pelo desligamento, e os backups já arquivados permanecem no R2 até a retenção expirar.

---

## 9. Evidência operacional

Em 4 de setembro de 2026, a execução manual [33883526187](https://github.com/Renato1909/LensClick/actions/runs/33883526187) confirmou o fluxo completo: exportação do D1 remoto, upload com `Resource location: remote`, existência do objeto `lensclick-backups/daily/backup-20260904T142433Z.sql` (15.662 bytes) e aplicação da retenção de 30 dias. A verificação usou apenas os logs e metadados da API; o conteúdo do backup não foi baixado nem exposto.

---

## 10. Formalização pendente

A frequência, a retenção e o local estão implementados, mas `docs/DECISOES_TECNICAS.md` ainda lista "Backup e restauração do D1" entre as **decisões que precisam ser formalizadas**. A formalização (subtarefa 5.2.c) deve registrar estes valores como decisão, encerrando a pendência.
