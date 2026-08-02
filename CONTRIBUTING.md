# Como contribuir com a LensClick

## Fluxo de trabalho

1. Atualize a branch `main` local antes de começar.
2. Crie uma branch curta e descritiva a partir da `main`.
3. Implemente uma alteração de escopo único.
4. Execute `npm test` e `npm run check`.
5. Envie a branch e abra um Pull Request para a `main`.
6. Aguarde a validação automática e a revisão antes de integrar.

Exemplos de nomes de branch:

- `feature/recuperacao-de-senha`
- `fix/traducao-do-rodape`
- `docs/atualiza-arquitetura`

## Commits

Use mensagens curtas que expliquem o resultado da mudança, como:

- `Adiciona recuperação de senha`
- `Corrige tradução dos termos de uso`
- `Atualiza documentação da API`

## Verificações obrigatórias

```text
npm test
npm run check
```

Não envie `.env`, `.dev.vars`, bancos locais, tokens, senhas, dados pessoais, `node_modules`, `.wrangler`, `dist` ou arquivos temporários.

## Pull Requests

O Pull Request deve explicar o que mudou, por que a alteração é necessária, como foi validada e qualquer impacto operacional. Mudanças maiores devem ser separadas em entregas menores e revisáveis.

