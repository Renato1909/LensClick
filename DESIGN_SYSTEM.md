# Design System LensClick

Este documento registra as decisões visuais compartilhadas do projeto. A regra principal é preservar a identidade LensClick e reutilizar os tokens de `public/refinements.css` antes de criar novos valores.

## Princípios

- Moderno e discreto: contraste claro, superfícies escuras, off-white e acento terroso.
- Consistente: componentes equivalentes devem ter a mesma altura, raio, espaçamento e movimento.
- Humano: textos diretos, animações curtas e sem excesso de brilho, gradiente ou deslocamento.
- Acessível: foco visível, estados que não dependem somente de cor e suporte a movimento reduzido.
- Responsivo: medidas fluidas somente quando o conteúdo realmente precisa se adaptar.

## Tokens oficiais

### Cores

| Uso | Token |
| --- | --- |
| Marca principal | `--lc-color-brand-primary` |
| Marca secundária | `--lc-color-brand-secondary` |
| Fundo | `--lc-color-bg` |
| Fundo elevado | `--lc-color-bg-elevated` |
| Superfície translúcida | `--lc-color-surface` |
| Texto principal | `--lc-color-text` |
| Texto secundário | `--lc-color-text-muted` |
| Sucesso | `--lc-color-success` |
| Erro | `--lc-color-error` |
| Informação | `--lc-color-info` |

### Espaçamento e forma

A escala usa `--lc-space-1`, `--lc-space-2`, `--lc-space-3`, `--lc-space-4`, `--lc-space-5`, `--lc-space-6`, `--lc-space-8`, `--lc-space-10`, `--lc-space-12` e `--lc-space-16`.

- Controles principais: `--lc-control-height`.
- Raio pequeno: `--lc-radius-sm`.
- Raio de botões e inputs: `--lc-radius-md`.
- Raio de cards: `--lc-radius-lg`.
- Elementos circulares: `--lc-radius-round`.

### Sombra e movimento

- Use `--lc-shadow-sm`, `--lc-shadow-md` e `--lc-shadow-lg` conforme a elevação.
- Ações principais podem usar `--lc-shadow-brand`.
- Use `--lc-duration-fast` para campos, `--lc-duration-base` para componentes e `--lc-duration-slow` somente em detalhes visuais.
- A curva padrão é `--lc-ease-standard`.

## Componentes

### Botões

- Altura mínima de 48 px.
- Raio médio e texto curto com verbo de ação.
- Um botão primário por contexto; os demais devem ser secundários ou de contorno.
- Estados obrigatórios: normal, hover, foco, pressionado, desabilitado e carregando.

### Campos

- Label sempre visível; placeholder não substitui label.
- Mensagens de ajuda ficam imediatamente abaixo do campo.
- Erros usam cor e indicação semântica `aria-invalid`.
- Inputs, selects e textareas compartilham altura, borda, fundo e foco.

### Cards e painéis

- Raio grande, borda sutil e uma única sombra de elevação.
- Espaçamento interno deve seguir a escala oficial.
- Evitar gradientes ou brilhos adicionais sem necessidade funcional.

### Feedback

- Sucesso confirma a ação realizada.
- Erro explica o problema e, quando possível, como corrigi-lo.
- Informação descreve um estado temporário, como carregamento.
- Mensagens devem ser curtas e funcionar em português e inglês.

## Compatibilidade

Os nomes antigos, como `--accent-1`, `--text`, `--radius` e `--shadow`, permanecem como aliases temporários. Código novo deve usar tokens iniciados por `--lc-`. A remoção dos aliases só deve acontecer após os estilos legados das páginas serem migrados.

Direção visual atual: carvão, off-white, cinza quente e um único acento suave para chamar atenção sem aparência neon.

