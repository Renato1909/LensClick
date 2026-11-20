# DEMO_FEIRA.md — Contas e dados de demonstração (LensClickApp)

> Uso exclusivo para a feira. **Nunca** versionar senhas, tokens ou credenciais
> de produção. O seed grava apenas hashes PBKDF2 (mesmo formato do Worker).

## Aplicação em produção — 20/11/2026

Seed aplicado no D1 de produção (`lensclick-db`, conta Cloudflare correta,
`wrangler whoami` confirmado). Validações pós-seed:

- `GET /api/photographers/demo-fotografo` → **200**, perfil publicado.
- `GET /api/photographers/demo-fotografo/reviews` → **200**.
- Login móvel das duas contas (`POST /api/mobile/auth/login`) → **200** com
  sessão Bearer de 43 caracteres e papéis `client`/`photographer`.
- D1: 2 usuários demo, 2 orçamentos (1 com proposta pendente), 1 contato de
  avaliação confirmado, 1 conversa com 2 mensagens, 1 favorito.
- As senhas foram geradas localmente, definidas apenas em variáveis de ambiente
  e rotacionadas antes da validação final; nenhuma senha aparece neste
  documento, em log ou no Git. Recuperação local: variáveis de ambiente de
  usuário `DEMO_CLIENT_PASSWORD` e `DEMO_PHOTOGRAPHER_PASSWORD`.

## O que o seed cria

- Conta **cliente** e conta **fotógrafo** (perfis publicados) com e-mails e senhas
  definidos por variáveis de ambiente.
- Fotógrafo `demo-fotografo` publicado, com bio/especialidades/cidade.
- Histórico de orçamentos: 1 pedido cancelado + 1 pedido com proposta pendente
  (o cliente pode demonstrar aceite/rejeição; o fotógrafo, envio de proposta).
- Contato (`review_request`) já **confirmado** — habilita o envio de avaliação
  direta pelo app (`POST /api/photographers/:slug/reviews`).
- Conversa com 2 mensagens e 1 favorito do cliente.
- Reexecutar o seed é seguro: não duplica os dados (teste de idempotência na suíte).

## Como executar (máquina com `wrangler` autenticado na conta Cloudflare)

PowerShell:

```powershell
$env:DEMO_CLIENT_EMAIL = 'demo.cliente@lensclick.local'
$env:DEMO_CLIENT_PASSWORD = '<senha forte definida pelo responsável>'
$env:DEMO_PHOTOGRAPHER_EMAIL = 'demo.fotografo@lensclick.local'
$env:DEMO_PHOTOGRAPHER_PASSWORD = '<senha forte definida pelo responsável>'

npm run seed:demo
```

O script gera o SQL em diretório temporário, aplica no **D1 remoto** com
`wrangler d1 execute lensclick-db --remote` e apaga o arquivo ao final. Use
`node scripts/seed-demo.mjs --dry-run` para apenas validar a geração (sem senhas
em claro na saída) ou `--sql` para inspecionar o SQL (contém apenas hashes).

## Distribuição das credenciais

- Compartilhe e-mail/senha **apenas pelo canal seguro acordado** (por exemplo,
  gerenciador de segredos ou mensagem efêmera) — nunca por e-mail comum, PR,
  issue, print ou documento versionado.
- Ao final da feira: **rotacione/remova** as contas demo. A exclusão pode ser
  feita pelo próprio app (`DELETE /api/account`, com senha + `EXCLUIR`) ou
  direto no D1 com `DELETE FROM users WHERE email LIKE 'demo.%@lensclick.local'`
  (cascata remove sessões e dados vinculados; R2 não é usado pelo seed).

## Roteiro sugerido no app

1. Login do cliente → ver perfil do fotógrafo `demo-fotografo` → favoritar.
2. Solicitar orçamento / ver pedido com proposta → aceitar ou rejeitar.
3. Abrir conversa existente → enviar mensagem → marcar como lida.
4. Enviar avaliação (o contato já está confirmado no seed).
5. Exportar dados da conta e excluir ao final (opcional).

## Limitações conhecidas para a demo

- **2FA:** o backend já suporta, mas o app `ad5cc75` fabrica o `challengeToken`
  e trata HTTP 202 como erro — o fluxo 2FA no app só funciona após esse ajuste
  no Kotlin. As contas demo **não** nascem com 2FA ativo (ver `ADR_002`).
- O app não envia `Idempotency-Key` nem chama `/api/mobile/auth/refresh`;
  retry seguro e renovação proativa ficam para a próxima iteração do app.
- Seed não cria imagens no R2: o perfil/portfólio aparecem sem foto.
