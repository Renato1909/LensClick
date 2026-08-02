# Configuracao e operacao da Cloudflare

O LensClick foi publicado em 1 de agosto de 2026. Este arquivo registra a configuracao realizada e serve como procedimento de manutencao.

URL oficial: `https://lensclick.renato-aparecido-business.workers.dev`

## 1. Autenticar novamente o Wrangler, quando necessario

```text
npx wrangler login
```

## 2. Banco D1 configurado

```text
npx wrangler d1 list
```

O banco `lensclick-db` ja esta conectado ao binding `DB`. Nao crie outro banco com o mesmo objetivo.

## 3. Bucket R2 configurado

```text
npx wrangler r2 bucket list
```

O bucket `lensclick-profile-images` usa a classe Standard e o binding `PROFILE_IMAGES`. Nao habilite acesso publico: as imagens sao entregues pelo Worker somente ao usuario autenticado.

## 4. Aplicar o esquema no D1 remoto

Primeiro confira as migracoes pendentes:

```text
npx wrangler d1 migrations list lensclick-db --remote
```

Depois aplique:

```text
npm run db:migrate:remote
```

## 5. Validar e republicar

```text
npm test
npm run check
npx wrangler deploy
```

O Wrangler deve informar a mesma URL oficial. Um dominio proprio podera ser conectado futuramente.

## 6. Ativar a recuperacao de senha

Essa etapa deve ser executada somente depois que um dominio de remetente estiver verificado no Resend.

1. Crie uma chave de API exclusiva para a LensClick.
2. Salve a chave como segredo do Worker:

```text
npx wrangler secret put RESEND_API_KEY
```

3. Salve o remetente completo, por exemplo `LensClick <conta@seudominio.com>`:

```text
npx wrangler secret put PASSWORD_RESET_FROM
```

4. Aplique a migracao remota e publique o codigo:

```text
npm run db:migrate:remote
npm test
npm run check
npx wrangler deploy
```

Nunca coloque a chave do Resend em `wrangler.jsonc`, no GitHub ou em arquivos dentro de `public/`.

## 7. Conferencia obrigatoria apos publicar

- Criar uma conta de teste nova.
- Confirmar login, logout e persistencia apos fechar o navegador.
- Editar os dados do perfil e enviar uma foto.
- Enviar contato e newsletter.
- Conferir as tabelas do D1 e o objeto privado no R2.
- Conferir metricas, erros e consumo dos limites gratuitos.
- Solicitar uma recuperacao, abrir o e-mail e confirmar que o link expira e nao pode ser reutilizado.

## Dados locais antigos

O arquivo `data/lensclick.sqlite`, se existir, nao e enviado automaticamente. Como a versao anterior usava outro algoritmo de senha, as contas locais devem ser recadastradas ou passar por uma redefinicao de senha planejada. Mensagens e newsletters podem ser exportadas e importadas separadamente quando fizermos a configuracao.
