# Plano do aplicativo Android, validação e publicação

> Plano de execução da Fase 6 do LensClick.
> Escopo: aplicativo Android nativo em Kotlin, desenvolvido no Android Studio; paridade com a plataforma web; autenticação em duas etapas; validação integral; Google Play; domínio próprio; e revisão jurídica.

---

## 1. Estado conhecido e limite atual

A plataforma web está versionada neste repositório e publicada no Cloudflare Workers. O aplicativo Android já existe fora desta árvore, mas seu código-fonte, configuração Gradle, `applicationId`, versão mínima do Android, arquitetura, testes e estado funcional ainda não estão disponíveis neste repositório. Portanto, nenhuma estimativa de paridade ou publicação deve ser tratada como confirmada antes da incorporação e auditoria do projeto Kotlin.

O aplicativo deve consumir o mesmo backend e os mesmos dados da plataforma; não deve criar uma segunda base de usuários, um segundo banco ou regras de negócio divergentes.

## 2. Resultado esperado

Ao final desta fase:

- o projeto Android estará versionado e reproduzível fora de uma única estação de trabalho;
- haverá uma matriz rastreável entre recursos web, contratos da API e telas/fluxos Android;
- os recursos aprovados como obrigatórios estarão disponíveis nas duas experiências;
- a autenticação em duas etapas terá política única para web e Android;
- web, API e Android terão evidências de testes funcionais, segurança, acessibilidade e dispositivos;
- o aplicativo estará assinado, testado em faixa interna/fechada e apto à publicação na Google Play;
- domínio, DNS e remetente Brevo estarão configurados e validados;
- Termos de Uso e Política de Privacidade terão parecer jurídico formal e versões publicadas.

## 3. Princípios obrigatórios

1. **Uma API e uma regra de negócio:** web e Android usam os contratos do Worker; lógica de autorização não é duplicada apenas no cliente.
2. **Fonte de verdade versionada:** o código Kotlin deve entrar em Git antes de alterações relevantes.
3. **Sem publicação direta:** primeiro faixa interna, depois teste fechado, produção somente após todos os gates.
4. **Segredos fora do repositório:** keystore, senhas, tokens e arquivos de credenciais nunca são commitados.
5. **Privacidade por padrão:** logs, screenshots, testes e relatórios não expõem dados pessoais reais.
6. **Paridade deliberada:** nem toda página institucional precisa virar tela nativa, mas toda diferença deve ser classificada como obrigatória, adaptada ao Android ou explicitamente adiada.

## 4. Fases e gates

### Gate A — incorporar e tornar o Android reproduzível

- localizar a pasta-fonte usada no Android Studio e criar backup antes de qualquer alteração;
- decidir entre monorepo (`android/`) ou repositório próprio; registrar a decisão técnica;
- importar código Kotlin, Gradle Wrapper e configurações públicas, excluindo `.gradle/`, builds, chaves e arquivos locais;
- confirmar `applicationId`, `namespace`, `minSdk`, `targetSdk`, `versionCode`, `versionName`, variantes e dependências;
- executar build limpo, testes existentes e instalação de debug em emulador e aparelho físico;
- documentar como abrir, compilar, testar e executar o aplicativo.

**Saída:** código Android versionado, build reproduzível e inventário técnico aprovado.

### Gate B — auditoria de paridade

Criar uma matriz por capacidade com estas colunas: recurso; rotas da API; web; Android; diferença; prioridade; dependência; teste; estado. O inventário mínimo deve cobrir:

- cadastro, login, logout, sessão, recuperação e verificação de e-mail;
- dados da conta, foto, senha, exclusão e exportação LGPD;
- perfil profissional, publicação, privacidade, categorias e capa do portfólio;
- busca, perfil público, imagens responsivas, avaliações e reputação;
- conversas, mensagens e contagem de não lidas;
- administração e moderação, caso o produto aprove seu uso em celular;
- PT-BR/EN-US, estados vazios, erros, offline/rede lenta e acessibilidade;
- Termos, Privacidade, consentimentos e links institucionais.

Cada item recebe uma decisão: **paridade obrigatória**, **experiência Android equivalente**, **web-only justificado** ou **adiado com risco aceito**.

**Saída:** `docs/MATRIZ_PARIDADE_ANDROID.md`, sem lacunas não classificadas.

### Gate C — contrato móvel e segurança de sessão

O backend atual foi desenhado para cookie seguro e mesma origem. Antes de conectar o app nativo, definir e formalizar:

- autenticação móvel: sessão opaca dedicada ou outro mecanismo revogável; não reutilizar cookie de navegador por conveniência;
- armazenamento local seguro com Android Keystore e APIs apropriadas, nunca preferências em texto puro;
- renovação, expiração, logout, revogação após troca de senha e limite de sessões;
- allowlist de origem e separação correta entre CSRF da web e autenticação nativa;
- certificate pinning somente se houver plano de rotação e recuperação; não adotar automaticamente;
- observabilidade com versão do app, plataforma e categoria de erro, sem PII.

**Saída:** decisão arquitetural e contratos de API cobertos por testes antes da integração do app.

### Gate D — paridade funcional no Android

Implementar por fatias verticais pequenas, na ordem: autenticação e conta; descoberta/perfis; perfil profissional/portfólio; avaliações; mensagens; administração aprovada. Cada fatia deve incluir UI, estados, i18n, acessibilidade, tratamento de erros, testes unitários e instrumentados e validação contra ambiente controlado.

**Saída:** matriz de paridade sem item obrigatório aberto.

### Gate E — autenticação em duas etapas

Tratar 2FA como recurso da conta, não como recurso exclusivo de uma interface. A decisão deve comparar TOTP, passkeys/WebAuthn e códigos por e-mail. A recomendação inicial é TOTP com códigos de recuperação, mantendo passkeys como evolução, porque funciona em web e Android sem depender da entrega de e-mail como segundo fator.

O desenho deve cobrir: ativação com reautenticação; confirmação do primeiro código; códigos de recuperação exibidos uma única vez; desafio no login; dispositivo/sessão confiável com expiração explícita; desativação protegida; recuperação de conta; revogação de sessões; rate limiting; auditoria; suporte administrativo sem acesso ao segredo; e migração para usuários existentes.

**Gate de segurança:** nenhuma implementação começa antes de threat model e decisão técnica. Nenhum segredo TOTP ou código de recuperação aparece em logs ou respostas posteriores à criação.

### Gate F — validação integral

| Camada | Evidência mínima |
|---|---|
| Backend/API | testes unitários, integração e contrato para todas as rotas afetadas |
| Web | lint, suíte Node, build, smoke e Playwright dos fluxos críticos |
| Android local | testes JVM em `test/` para regras e ViewModels |
| Android instrumentado | testes em `androidTest/` para navegação, persistência segura e fluxos críticos |
| Compatibilidade | versão mínima, versão-alvo e matriz representativa de tamanhos/versões Android |
| Dispositivo real | ao menos um telefone e um tablet; rede lenta, perda de rede, retorno do background e rotação |
| Segurança | sessão, armazenamento, 2FA, brute force, links profundos, screenshots sensíveis e logs |
| Acessibilidade | TalkBack, ordem de foco, contraste, tamanho de fonte e alvos de toque |
| Privacidade/legal | consentimentos, coleta efetiva, exportação/exclusão e formulário Data safety coerente |
| Operação | alertas, rollback, compatibilidade mínima da API e suporte a versão antiga do app |

A documentação oficial do Android separa testes locais (`test`) e instrumentados (`androidTest`) e recomenda testar a versão de release em dispositivos representativos. Referências: [estratégias de teste](https://developer.android.com/training/testing/fundamentals/strategies), [o que testar](https://developer.android.com/training/testing/fundamentals/what-to-test) e [preparação para release](https://developer.android.com/studio/publish/preparing).

### Gate G — domínio próprio e e-mail

1. escolher e registrar o domínio com titularidade definida;
2. adicionar a zona à Cloudflare e definir domínio canônico e redirecionamento (`www` ou raiz);
3. configurar o Worker como Custom Domain e validar certificado, HSTS, canonical, sitemap, cookies e links;
4. adicionar o domínio no Brevo e configurar os registros fornecidos para autenticação, incluindo DKIM e DMARC;
5. criar remetentes institucionais e executar testes de entrega, spam, recuperação e verificação de e-mail;
6. atualizar URLs da API/app, links profundos, política, termos, Play Console e materiais de suporte.

A Cloudflare cria DNS e certificado ao associar um [Custom Domain ao Worker](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). A Brevo exige domínio próprio e orienta a configuração e verificação de [DKIM e DMARC](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC). O domínio não deve ser inventado no código antes da escolha e do registro.

### Gate H — revisão jurídica formal

Preparar um pacote para advogado com conhecimento em tecnologia, consumidor e LGPD:

- Termos de Uso e Política de Privacidade atuais, com histórico de versões;
- mapa de dados por finalidade, base legal, origem, destino, retenção e exclusão;
- lista de operadores/suboperadores: Cloudflare, Brevo, Google Play e demais serviços efetivamente usados;
- fluxos de cadastro, verificação, 2FA, mensagens, avaliações, moderação, exportação e exclusão;
- público-alvo, idade mínima, canal do titular, contato do encarregado e processo de incidentes;
- respostas planejadas do formulário Data safety da Google Play;
- diferenças de coleta entre web e Android, inclusive telemetria, permissões e identificadores.

O resultado deve ser um parecer ou aprovação rastreável, textos finais versionados, data de vigência, plano de comunicação de mudanças e checklist de implementação. A equipe técnica não substitui a revisão do profissional jurídico.

### Gate I — publicação na Google Play

1. criar/verificar a conta de desenvolvedor e o registro do aplicativo no Play Console;
2. definir nome, pacote definitivo, categoria, contato, países, classificação, público e política de privacidade no domínio próprio;
3. criar e proteger a upload key; ativar Play App Signing; documentar recuperação e responsáveis;
4. gerar o Android App Bundle (`.aab`) de release, sem logs de debug e com versão correta;
5. preparar ícone, screenshots, feature graphic, descrições PT-BR/EN-US e notas da versão;
6. preencher App content e Data safety conforme o comportamento auditado, não por suposição;
7. publicar primeiro na faixa interna, depois teste fechado exigido para a conta, corrigir pre-launch report e feedback;
8. usar lançamento gradual/gerenciado para produção, monitorar crashes, ANRs, autenticação, API e avaliações;
9. manter rollback operacional do backend e interromper rollout do app se os gates falharem.

Novos aplicativos na Google Play são distribuídos como Android App Bundle. O bundle precisa ser assinado com uma upload key e o Play App Signing gerencia a assinatura distribuída. Referências oficiais: [publicar aplicativo Android](https://developer.android.com/studio/publish), [assinar o aplicativo](https://developer.android.com/studio/publish/app-signing), [criar o aplicativo no Play Console](https://support.google.com/googleplay/android-developer/answer/9859152?hl=pt-br) e [publicar uma versão](https://support.google.com/googleplay/android-developer/answer/9859751?hl=pt-br).

## 5. Ordem executiva recomendada

1. Gate A — obter e versionar o projeto Kotlin.
2. Gate B — produzir a matriz real de paridade.
3. Gate C — decidir e implementar o contrato móvel seguro.
4. Gate G — escolher o domínio e preparar DNS/e-mail, pois ele estabiliza URLs públicas.
5. Gate H — iniciar a revisão jurídica em paralelo após o inventário de dados; concluir antes da produção comercial.
6. Gate D — implementar paridade por fatias.
7. Gate E — projetar e implementar 2FA para web e Android.
8. Gate F — executar a validação integral e corrigir achados.
9. Gate I — faixa interna, teste fechado e lançamento gradual na Google Play.

## 6. Bloqueios que exigem decisão do mantenedor

- localização e forma de entrega do projeto Android Studio;
- monorepo ou repositório Android separado;
- domínio a registrar e sua titularidade;
- conta Google Play (pessoal ou organização) e responsáveis;
- identidade legal do controlador, contato público e profissional jurídico;
- escopo inicial de paridade e presença ou não do painel administrativo no app;
- política final de 2FA e recuperação de conta.

Nenhum desses bloqueios autoriza inventar credenciais, domínio, package name, respostas legais ou dados da loja.
