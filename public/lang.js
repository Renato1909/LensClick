/* Simple i18n for LensClick: supports 'pt' and 'en'.
   - Use data-i18n="key" on elements to translate textContent (or innerHTML when data-i18n-html="true").
   - Use data-i18n-placeholder="key" on inputs to translate placeholder.
   - Use data-i18n-section="key" on section indicators to update their data-section attribute (used by CSS).
   - Title elements can use <title data-i18n="key">.
   Saves selection in localStorage.lang.
*/
(function(){
  const translations = {
    pt: {
      'footer': '© {year} Lens Click. Todos os direitos reservados',
      'privacy': 'Política de Privacidade',
      'terms': 'Termos de Uso',
  'contact.form.name.placeholder': 'Seu nome completo',
  'contact.form.phone.placeholder': '(11) 12345-6789',
  'contact.form.email.placeholder': 'seu@email.com',
  'contact.form.date.placeholder': 'dd/mm/aaaa',
  'contact.form.message.placeholder': 'Conte o que você quer fotografar, a data e qualquer detalhe importante.',
      // Nav
      'nav.home': 'Home',
      'nav.about': 'Sobre',
      'nav.services': 'Serviços',
      'nav.portfolio': 'Portfólio',
      'nav.contact': 'Contato',
      'nav.reviews': 'Avaliações',
      'nav.faq': 'FAQ',

      // Auth
      'auth.login': 'Entrar',
      'auth.signup': 'Cadastrar',

      // Sections (indicator)
      'section.home': 'Home',
      'section.about': 'Sobre',
      'section.services': 'Serviços',
      'section.portfolio': 'Portfólio',
      'section.servicesTitle': 'NOSSOS <span class="gradient-text">SERVIÇOS</span>',
      'section.portfolioTitle': 'NOSSO <span class="gradient-text">PORTFÓLIO</span>',
      'section.contact': 'Contato',
      'section.reviews': 'Avaliações',
      'section.faq': 'FAQ',

      // Hero
      'hero.title1': 'SEU MOMENTO, <span class="gradient-text">DO SEU JEITO</span>',
      'hero.lead': 'Retratos, casamentos e eventos fotografados com direção leve e atenção aos detalhes.',
      'hero.cta.view': 'VER NOSSO TRABALHO',
      'hero.cta.contact': 'FALAR COM A EQUIPE',
  // Additional hero slides
  'hero.slide2.title': 'IMAGENS COM <span class="gradient-text">IDENTIDADE</span>',
  'hero.slide2.lead': 'Cada sessão é pensada para combinar com você, com o lugar e com o momento.',
  'hero.slide2.cta.services': 'NOSSOS SERVIÇOS',
  'hero.slide2.cta.about': 'SOBRE NÓS',
  'hero.slide3.title': 'O AMOR COMO <span class="gradient-text">ELE ACONTECE</span>',
  'hero.slide3.lead': 'Registramos gestos, olhares e detalhes sem tirar você do momento.',
  'hero.slide3.cta.book': 'CONSULTAR UMA DATA',
  'hero.slide3.cta.reviews': 'AVALIAÇÕES',

      // Contact
      'contact.title': 'VAMOS <span class="gradient-text">CONVERSAR</span>',
      'contact.tabs.form': 'Formulário',
      'contact.tabs.info': 'Informações',
      'contact.tabs.newsletter': 'Newsletter',
      'contact.form.submit': 'ENVIAR MENSAGEM',

      // Signup
      'signup.pageTitle': 'Cadastro | LensClick',
      'signup.title': 'Criar <span class="gradient-text">Conta</span>',
      'signup.lead': 'Junte-se à nossa comunidade de amantes da fotografia',
      'signup.name.label': 'Nome Completo',
      'signup.name.placeholder': 'Seu nome completo',
      'signup.email.label': 'E-mail',
      'signup.email.placeholder': 'seu@email.com',
      'signup.phone.label': 'Telefone',
    'signup.phone.placeholder': '(11) 12345-6789',
      'signup.password.label': 'Senha',
      'signup.password.placeholder': 'Crie uma senha segura',
      'signup.password.hint': 'Use pelo menos 8 caracteres, incluindo uma letra e um número.',
      'signup.confirm.label': 'Confirmar Senha',
      'signup.confirm.placeholder': 'Digite novamente sua senha',
      'signup.consent': 'Li e concordo com os <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.',
      'signup.submit': 'Criar Conta',
      'signup.success': 'Cadastro realizado com sucesso! Redirecionando...',
      'signup.haveAccount': 'Já tem uma conta? <a href="login.html" class="auth-link">Fazer login</a>',
      'signup.loginLink': 'Fazer login',
      'signup.back': 'Voltar ao site',
  // Profile
  'profile.title': 'Minha conta | LensClick',
  'profile.eyebrow': 'Configurações da conta',
  'profile.heading': 'Sua conta, do seu jeito',
  'profile.lead': 'Mantenha seus dados atualizados e cuide da segurança do seu acesso.',
  'profile.emailLabel': 'E-mail',
  'profile.email.help': 'Usado para entrar e recuperar sua conta.',
  'profile.email.confirmation': 'Para proteger sua conta, confirme a senha atual antes de trocar o e-mail.',
  'profile.phoneLabel': 'Telefone',
  'profile.logout': 'Sair',
  'profile.nameLabel': 'Nome completo',
  'profile.roleLabel': 'Como você usa a LensClick?',
  'profile.role.client': 'Como cliente',
  'profile.role.photographer': 'Como fotógrafo',
  'profile.ageLabel': 'Idade',
  'profile.optional': 'opcional',
  'profile.genderLabel': 'Gênero',
  'profile.gender.male': 'Masculino',
  'profile.gender.female': 'Feminino',
  'profile.gender.other': 'Prefiro não informar',
  'profile.save': 'Salvar alterações',
  'profile.personal.title': 'Dados pessoais',
  'profile.personal.lead': 'Informações usadas para identificar e manter contato com você.',
  'profile.photo.change': 'Escolher foto',
  'profile.photo.remove': 'Remover foto',
  'profile.photo.hint': 'JPG, PNG ou WebP, com até 450 KB.',
  'profile.photo.dialogTitle': 'Remover foto do perfil?',
  'profile.photo.dialogText': 'A imagem será apagada permanentemente. Você poderá adicionar outra quando quiser.',
  'profile.photo.confirm': 'Sim, remover',
  'profile.security.title': 'Senha e segurança',
  'profile.security.lead': 'Use uma senha exclusiva que você não utiliza em outros serviços.',
  'profile.currentPassword': 'Senha atual',
  'profile.newPassword': 'Nova senha',
  'profile.confirmPassword': 'Confirmar nova senha',
  'profile.password.rules': 'Use pelo menos 8 caracteres, incluindo uma letra e um número.',
  'profile.password.sessions': 'Ao trocar a senha, encerraremos suas sessões nos outros dispositivos.',
  'profile.password.submit': 'Atualizar senha',
  'profile.cancel': 'Cancelar',
  'profile.backToSite': 'Voltar ao site',

      // Login
      'login.pageTitle': 'Login | LensClick',
      'login.title': 'Entrar na <span class="gradient-text">LensClick</span>',
      'login.lead': 'Acesse sua conta para editar seu perfil',
      'login.email.label': 'E-mail',
      'login.email.placeholder': 'seu@email.com',
      'login.password.label': 'Senha',
      'login.password.placeholder': 'Sua senha',
      'login.forgotPassword': 'Esqueci minha senha',
      'login.submit': 'Entrar',
      'login.success': 'Login realizado com sucesso! Redirecionando...',
      'login.signupLink': 'Cadastre-se',
      'login.back': 'Voltar ao site',
      'recovery.request.pageTitle': 'Recuperar senha | LensClick',
      'recovery.request.title': 'Recupere sua senha',
      'recovery.request.lead': 'Informe seu e-mail e enviaremos um link seguro para criar uma nova senha.',
      'recovery.email.label': 'E-mail',
      'recovery.email.placeholder': 'seu@email.com',
      'recovery.request.submit': 'Enviar link seguro',
      'recovery.backLogin': 'Voltar para o login',
      'recovery.confirm.pageTitle': 'Nova senha | LensClick',
      'recovery.confirm.title': 'Crie uma nova senha',
      'recovery.confirm.lead': 'Escolha uma senha diferente e difícil de adivinhar.',
      'recovery.password.label': 'Nova senha',
      'recovery.password.placeholder': 'Digite a nova senha',
      'recovery.password.hint': 'Use pelo menos 8 caracteres, incluindo uma letra e um número.',
      'recovery.confirmPassword.label': 'Confirmar nova senha',
      'recovery.confirmPassword.placeholder': 'Digite novamente a nova senha',
      'recovery.confirm.submit': 'Salvar nova senha',
      
  // About
  'about.title': 'SOBRE <span class="gradient-text">NÓS</span>',
  'about.historyTitle': 'NOSSA <span class="gradient-text">HISTÓRIA</span>',
  'about.p1': 'A Lens Click nasceu em 2025, criada por estudantes que perceberam como era difícil encontrar e escolher o serviço fotográfico certo. O site surgiu para tornar essa decisão mais simples.',
  'about.p2': 'Antes de fotografar, ouvimos o que você quer guardar. Depois, cuidamos da direção, da luz e dos detalhes para criar imagens que tenham a sua cara.',

  // Stats
  'stats.projects': 'Projetos realizados',
  'stats.months': 'Meses de experiência',
  'stats.couples': 'Casais felizes',
  'stats.events': 'Eventos cobertos',

  // Services
  'services.portrait': 'Ensaios de Retrato',
  'services.from': 'A partir de',
  'services.portrait.f1': 'Sessão de 1h',
  'services.portrait.f2': '20 fotos editadas',
  'services.portrait.f3': 'Orientação de poses',
  'services.portrait.f4': 'Local à escolha',
  'services.wedding': 'Fotografia de Casamento',
  'services.wedding.f1': 'Cobertura',
  'services.wedding.f2': 'Álbum digital',
  'services.wedding.f3': 'Fotos espontâneas',
  'services.wedding.f4': 'Sessão pós-casamento',
  'services.events': 'Fotografia de Eventos',
  'services.range': 'Entre',
  'services.events.f1': 'Cobertura completa',
  'services.events.f2': 'Fotos em alta resolução',
  'services.events.f3': 'Galeria Online',
  'services.events.f4': 'Suporte total',
  'services.commercial': 'Fotografia Comercial',
  'services.commercial.f1': 'Fotos de produtos',
  'services.commercial.f2': 'Pacotes corporativos',
  'services.commercial.f3': 'Ensaios comerciais',
  'services.commercial.f4': 'Uso comercial',
  'services.request': 'Solicitar orçamento',

  // Quotes
  'quotes.q1': '"Seu momento, sem poses forçadas."',
  'quotes.q2': '"Direção quando você precisar."',
  'quotes.q3': '"Os detalhes também merecem uma foto."',
  'quotes.q4': '"Você vive. A gente registra."',

  // Portfolio filters
  'filter.all': 'Tudo',
  'filter.retratos': 'Retratos',
  'filter.weddings': 'Casamentos',
  'filter.events': 'Eventos',
  'filter.commercial': 'Comercial',

  // Contact (tabs already present above)

  // Portfolio lead
  'portfolio.lead': 'Veja uma seleção de <b><span class="gradient-text">retratos, casamentos e eventos</span></b>, além de trabalhos <b><span class="gradient-text">comerciais</span></b> da Lens Click.',

  // Contact / Form
  'contact.title': 'VAMOS <span class="gradient-text">CONVERSAR</span>',
  'contact.lead': 'Conte o que você está planejando. Respondemos com disponibilidade, próximos passos e um orçamento claro.',
  'contact.form.selectService': 'Selecione o serviço desejado',
  'contact.info.locationLabel': 'Localização',
  'contact.info.location': 'São Paulo, SP',
  'contact.hoursTitle': 'HORÁRIOS DE <span class="gradient-text">ATENDIMENTO</span>',
  'contact.studiosTitle': 'NOSSOS <span class="gradient-text">ESTÚDIOS</span>',

  // Newsletter / footer
  'newsletter.title': 'NOVIDADES DA <span class="gradient-text">LENS CLICK</span>',
  'newsletter.lead': 'Bastidores, dicas e novidades da Lens Click, direto no seu e-mail.',
  'newsletter.specials': 'De vez em quando, enviamos também ofertas para inscritos.',
  'newsletter.tipTitle': 'Vantagens para inscritos',
  'newsletter.tipLead': 'Ofertas e condições especiais',
  'newsletter.proTitle': 'Dicas práticas',
  'newsletter.proLead': 'Orientações simples para fotos melhores',
  'newsletter.firstTitle': 'Em primeira mão',
  'newsletter.firstLead': 'Novos trabalhos e serviços',
  'newsletter.cta': 'Cadastre seu e-mail e receba gratuitamente o guia “10 dicas práticas para fotos melhores”.',
  'newsletter.submit': 'QUERO RECEBER',
  'newsletter.emailPlaceholder': 'seu@email.com',
  'newsletter.privacyNote': 'Seu e-mail será usado apenas para administrar sua inscrição.',

  'contact.info.title': 'FALE COM A <span class="gradient-text">EQUIPE</span>',
  'contact.info.lead': 'Escolha o canal que preferir para tirar dúvidas, consultar datas ou conversar sobre seu projeto.',

  // Reviews
  'reviews.title': 'AVALIAÇÕES',

  // FAQ
  'faq.title': 'PERGUNTAS <span class="gradient-text">FREQUENTES</span>',
  'faq.q1': 'Qual o prazo de entrega?',
  'faq.a1': 'Entre 7 e 20 dias úteis, dependendo do serviço contratado e da quantidade de fotos.',
  'faq.q2': 'Como funciona o pagamento?',
  'faq.a2': 'Aceitamos PIX, cartão e boleto. Geralmente 30% na reserva e o restante na entrega.',
  'faq.q3': 'Posso escolher as fotos que serão editadas?',
  'faq.a3': 'Sim! Enviamos uma galeria para seleção e, a partir dela, seguimos com a edição final.',
  'faq.q4': 'Vocês oferecem álbuns físicos e virtuais?',
  'faq.a4': 'Oferecemos ambos. Temos diferentes formatos e acabamentos para você escolher.',
  'faq.q5': 'Como é feito a entrega das fotos?',
  'faq.a5': 'Por galeria online com link protegido e opção de download. Para pacotes premium, também em pendrive.',
  'faq.q6': 'Vocês têm seguro para os equipamentos?',
  'faq.a6': 'Sim, todo o nosso equipamento é segurado para garantir a continuidade do trabalho.',
  'faq.q7': 'Vocês fazem ensaios externos?',
  'faq.a7': 'Fazemos sim. Podemos sugerir locais ou realizar no lugar de sua preferência.',
  'faq.q8': 'Como funciona o agendamento de um ensaio?',
  'faq.a8': 'Entre em contato pelo formulário informando a data desejada. Confirmamos disponibilidade e fechamos os detalhes.',

  // Privacy / Terms
  'privacy.title': 'Política de Privacidade',
  'privacy.back': 'Voltar ao site',
  'privacy.footer': '© {year} Lens Click. Todos os direitos reservados | <a href="privacidade.html">Política de Privacidade</a> | <a href="termos.html">Termos de Uso</a>',
  'terms.title': 'Termos de Uso',
  'terms.back': 'Voltar ao site'
      ,
      // Reviews
      'review.r1.name': 'Maurício e Maria — Casamento',
      'review.r1.text': 'A Lens Click capturou perfeitamente a magia do nosso casamento. Cada foto conta uma história e nos emociona até hoje. Profissionalismo e talento excepcionais!',
      'review.r2.name': 'Empresa TechStart — Fotografia Corporativa',
      'review.r2.text': 'Precisávamos de fotos profissionais para nosso equipe e o resultado superou todas as expectativas. Recomendamos a todos!',
      'review.r3.name': 'Marina Mendes — Ensaio individual',
      'review.r3.text': 'Uma experiência incrível! Me senti confiante e as fotos ficaram maravilhosas.',
      'review.r4.name': 'Rafael e Sofia — Pré-casamento',
      'review.r4.text': 'O ensaio pré-casamento foi incrível! A equipe nos deixou super confortáveis e as fotos ficaram de tirar o fôlego.',
      'privacy.p1': 'A Lens Click valoriza a privacidade de seus clientes e visitantes. Esta Política de Privacidade explica como coletamos, usamos, protegemos e compartilhamos suas informações pessoais ao utilizar nosso site e serviços.',
      'privacy.sec1.title': '1. Informações Coletadas',
      'privacy.sec1.li1': '<b>Informações fornecidas pelo usuário:</b> Dados de conta, perfil, contato, newsletter e solicitações de projeto.',
      'privacy.sec1.li2': '<b>Informações técnicas essenciais:</b> Cookie de sessão e dados temporários de conexão usados para segurança e prevenção de abuso.',
      'privacy.sec2.title': '2. Uso das Informações',
      'privacy.sec2.li1': 'Responder dúvidas, solicitações e orçamentos.',
      'privacy.sec2.li2': 'Melhorar nossos serviços e experiência do usuário.',
      'privacy.sec2.li3': 'Enviar comunicações, novidades e promoções (com consentimento).',
      'privacy.sec3.title': '3. Compartilhamento de Dados',
      'privacy.sec3.p': 'Utilizamos provedores de infraestrutura em nuvem, atualmente Cloudflare (Workers, D1 e R2), estritamente para operar e proteger o serviço. Outros compartilhamentos ocorrem somente quando necessários à prestação contratada ou exigidos por lei.',
      'privacy.sec4.title': '4. Segurança',
      'privacy.sec4.p': 'As senhas são armazenadas por hash criptográfico e as sessões autenticadas utilizam cookie essencial, restrito a HTTP. Nenhum sistema pode garantir segurança absoluta.',
      'privacy.sec5.title': '5. Cookies',
      'privacy.sec5.p': 'Utilizamos somente um cookie essencial para manter a sessão autenticada. A preferência de idioma é salva no dispositivo e a LensClick não utiliza cookies de análise.',
      'privacy.sec6.title': '6. Direitos do Usuário',
      'privacy.sec6.li1': 'Acesso, correção ou exclusão de seus dados pessoais.',
      'privacy.sec6.li2': 'Solicitação de informações sobre o tratamento de dados.',
      'privacy.sec6.li3': 'Revogação do consentimento para comunicações.',
      'privacy.sec7.title': '7. Alterações na Política',
      'privacy.sec7.p': 'Esta política pode ser atualizada periodicamente. Recomendamos que você revise esta página regularmente.',
      'privacy.sec8.title': '8. Contato',
      'privacy.sec8.p': 'Para dúvidas sobre privacidade, entre em contato pelo e-mail <a href="mailto:lensclick@gmail.com">lensclick@gmail.com</a>.'
    },
    en: {
      'footer': '© {year} Lens Click. All rights reserved',
      'privacy': 'Privacy Policy', 
      'terms': 'Terms of Use',
      'terms.title': 'Terms of Use',
  'terms.p1': 'These Terms of Use govern access to and use of the Lens Click website and its photography services. By using our site, you agree to the conditions below.',
  'terms.sec1.title': '1. Services',
  'terms.sec1.li1': 'Lens Click offers professional photography services, scheduling, quotes, and information via the website.',
  'terms.sec1.li2': 'Details of each service, prices, and conditions are provided before contracting.',
  'terms.sec2.title': '2. Site Use',
  'terms.sec2.li1': 'The user agrees to provide true and updated information in the forms.',
  'terms.sec2.li2': 'It is forbidden to use the site for illicit, offensive purposes or that violate third-party rights.',
  'terms.sec3.title': '3. Intellectual Property',
  'terms.sec3.li1': 'All site content, including texts, images, logos, and photographs, belongs to Lens Click or its partners and is protected by copyright.',
  'terms.sec3.li2': 'Reproduction, distribution, or commercial use without prior authorization is prohibited.',
  'terms.sec4.title': '4. Privacy',
  'terms.sec4.p': 'The processing of personal data follows our <a href="privacidade.html">Privacy Policy</a>.',
  'terms.sec5.title': '5. Limitation of Liability',
  'terms.sec5.li1': 'Lens Click is not responsible for damages resulting from technical failures, unavailability, or improper use of the site.',
  'terms.sec5.li2': 'The site may contain links to third-party sites, for which we are not responsible.',
  'terms.sec6.title': '6. Changes to Terms',
  'terms.sec6.p': 'These terms may be updated at any time. We recommend that you review them periodically.',
  'terms.sec7.title': '7. Contact',
  'terms.sec7.p': 'For questions about the terms, contact us at <a href="mailto:lensclick@gmail.com">lensclick@gmail.com</a>.',
  'terms.footer': '© {year} Lens Click. All rights reserved | <a href="privacidade.html">Privacy Policy</a> | <a href="termos.html">Terms of Use</a>',
  'privacy.p1': 'Lens Click values the privacy of its clients and visitors. This Privacy Policy explains how we collect, use, protect, and share your personal information when using our site and services.',
  'privacy.sec1.title': '1. Information Collected',
  'privacy.sec1.li1': '<b>Information provided by the user:</b> Account, profile, contact, newsletter, and project request data.',
  'privacy.sec1.li2': '<b>Essential technical information:</b> Session cookies and temporary connection data used for security and abuse prevention.',
  'privacy.footer': '© {year} Lens Click. All rights reserved | <a href="privacidade.html">Privacy Policy</a> | <a href="termos.html">Terms of Use</a>',
  'privacy.sec2.title': '2. Use of Information',
  'privacy.sec2.li1': 'Respond to questions, requests, and quotes.',
  'privacy.sec2.li2': 'Improve our services and user experience.',
  'privacy.sec2.li3': 'Send communications, news, and promotions (with consent).',
  'privacy.sec3.title': '3. Data Sharing',
  'privacy.sec3.p': 'We use cloud infrastructure providers, currently Cloudflare (Workers, D1 and R2), strictly to operate and protect the service. Other disclosures occur only when necessary to provide contracted services or when required by law.',
  'privacy.sec4.title': '4. Security',
  'privacy.sec4.p': 'Passwords are stored using a cryptographic hash, and authenticated sessions use an essential, HTTP-only cookie. No system can guarantee absolute security.',
  'privacy.sec5.title': '5. Cookies',
  'privacy.sec5.p': 'We use only an essential cookie to maintain the authenticated session. The language preference is saved on the device and no analytics cookies are used by LensClick.',
  'privacy.sec6.title': '6. User Rights',
  'privacy.sec6.li1': 'Access, correction, or deletion of your personal data.',
  'privacy.sec6.li2': 'Request information about data processing.',
  'privacy.sec6.li3': 'Revoke consent for communications.',
  'privacy.sec7.title': '7. Policy Changes',
  'privacy.sec7.p': 'This policy may be updated periodically. We recommend that you review this page regularly.',
  'privacy.sec8.title': '8. Contact',
  'privacy.sec8.p': 'For privacy questions, contact us at <a href="mailto:lensclick@gmail.com">lensclick@gmail.com</a>.',
  'newsletter.submit': 'KEEP ME POSTED',
  'newsletter.emailPlaceholder': 'you@email.com',
  'newsletter.proTitle': 'Practical tips',
  'newsletter.proLead': 'Simple guidance for better photos',
  'newsletter.firstTitle': 'First look',
  'newsletter.firstLead': 'New work and services',
  'newsletter.title': 'THE LATEST FROM <span class="gradient-text">LENS CLICK</span>',
  'newsletter.specials': 'Occasionally, we also send subscriber-only offers.',
  'contact.hours.week': 'Monday – Friday: 9am to 6pm',
  'contact.hours.sat': 'Saturday: 9am to 2pm',
  'contact.hours.sun': 'Sunday: Closed',
  'contact.info.title': 'TALK TO OUR <span class="gradient-text">TEAM</span>',
  'contact.info.lead': 'Choose the channel you prefer to ask questions, check dates or discuss your project.',
  'contact.info.emailLabel': 'Email',
  'contact.info.phoneLabel': 'Phone',
  'login.noAccount': "Don't have an account?",
  'footer.copyright': '© {year} Lens Click. All rights reserved',
  'contact.form.service.portrait': 'Portrait',
  'contact.form.service.wedding': 'Wedding',
  'contact.form.service.event': 'Event',
  'contact.form.service.commercial': 'Commercial',
  // Contact form labels and placeholders
  'contact.form.name': 'NAME *',
  'contact.form.name.placeholder': 'Your full name',
  'contact.form.phone': 'PHONE',
  'contact.form.phone.placeholder': '(11) 12345-6789',
  'contact.form.email': 'E-MAIL *',
  'contact.form.email.placeholder': 'you@email.com',
  'contact.form.service': 'TYPE OF SERVICE',
  'contact.form.date': 'EVENT DATE',
  'contact.form.date.placeholder': 'dd/mm/yyyy',
  'contact.form.message': 'MESSAGE *',
  'contact.form.message.placeholder': 'Tell us what you’d like photographed, the date and any important details.',
  // Nav
      'nav.home': 'Home',
      'nav.about': 'About',
      'nav.services': 'Services',
      'nav.portfolio': 'Portfolio',
      'nav.contact': 'Contact',
      'nav.reviews': 'Reviews',
      'nav.faq': 'FAQ',

      // Auth
      'auth.login': 'Login',
      'auth.signup': 'Sign up',

  // Sections
  'section.home': 'Home',
  'section.about': 'About',
      'section.services': 'Services',
  'section.portfolio': 'Portfolio',
  'section.servicesTitle': 'OUR <span class="gradient-text">SERVICES</span>',
  'section.portfolioTitle': 'OUR <span class="gradient-text">PORTFOLIO</span>',
  'section.contact': 'Contact',
  'section.reviews': 'Reviews',
  'section.faq': 'FAQ',

      // Hero
      'hero.title1': 'YOUR MOMENT, <span class="gradient-text">YOUR WAY</span>',
      'hero.lead': 'Portraits, weddings and events photographed with a relaxed approach and an eye for detail.',
      'hero.cta.view': 'SEE OUR WORK',
      'hero.cta.contact': 'TALK TO US',
  // Additional hero slides
  'hero.slide2.title': 'IMAGES WITH <span class="gradient-text">CHARACTER</span>',
  'hero.slide2.lead': 'Every session is shaped around you, the setting and the moment.',
  'hero.slide2.cta.services': 'OUR SERVICES',
  'hero.slide2.cta.about': 'ABOUT US',
  'hero.slide3.title': 'LOVE, <span class="gradient-text">AS IT HAPPENS</span>',
  'hero.slide3.lead': 'We capture the glances, gestures and details without pulling you out of the moment.',
  'hero.slide3.cta.book': 'CHECK A DATE',
  'hero.slide3.cta.reviews': 'REVIEWS',

      // Contact
      'contact.title': 'LET’S <span class="gradient-text">TALK</span>',
      'contact.tabs.form': 'Form',
      'contact.tabs.info': 'Info',
      'contact.tabs.newsletter': 'Newsletter',
      'contact.form.submit': 'SEND MESSAGE',

      // Signup
      'signup.pageTitle': 'Sign up | LensClick',
      'signup.title': 'Create an <span class="gradient-text">Account</span>',
      'signup.lead': 'Join our community of photography lovers',
      'signup.name.label': 'Full name',
      'signup.name.placeholder': 'Your full name',
      'signup.email.label': 'Email',
      'signup.email.placeholder': 'you@email.com',
      'signup.phone.label': 'Phone',
  'signup.phone.placeholder': '(11) 12345-6789',
      'signup.password.label': 'Password',
      'signup.password.placeholder': 'Create a secure password',
      'signup.password.hint': 'Use at least 8 characters, including one letter and one number.',
      'signup.confirm.label': 'Confirm Password',
      'signup.confirm.placeholder': 'Type your password again',
      'signup.consent': 'I have read and agree to the <a href="termos.html" target="_blank" rel="noopener">Terms of Use</a> and <a href="privacidade.html" target="_blank" rel="noopener">Privacy Policy</a>.',
      'signup.submit': 'Create Account',
      'signup.success': 'Account created! Redirecting...',
      'signup.haveAccount': 'Already have an account? <a href="login.html" class="auth-link">Login</a>',
      'signup.loginLink': 'Login',
      'signup.back': 'Back to site',

      // Login
      'login.pageTitle': 'Login | LensClick',
      'login.title': 'Sign in to <span class="gradient-text">LensClick</span>',
      'login.lead': 'Access your account to edit your profile',
      'login.email.label': 'Email',
      'login.email.placeholder': 'you@email.com',
      'login.password.label': 'Password',
      'login.password.placeholder': 'Your password',
      'login.forgotPassword': 'Forgot my password',
      'login.submit': 'Sign in',
      'login.success': 'Login successful! Redirecting...',
      'login.signupLink': 'Sign up',
      'login.back': 'Back to site',
      'recovery.request.pageTitle': 'Password recovery | LensClick',
      'recovery.request.title': 'Recover your password',
      'recovery.request.lead': 'Enter your email and we will send a secure link to create a new password.',
      'recovery.email.label': 'Email',
      'recovery.email.placeholder': 'you@email.com',
      'recovery.request.submit': 'Send secure link',
      'recovery.backLogin': 'Back to login',
      'recovery.confirm.pageTitle': 'New password | LensClick',
      'recovery.confirm.title': 'Create a new password',
      'recovery.confirm.lead': 'Choose a different password that is difficult to guess.',
      'recovery.password.label': 'New password',
      'recovery.password.placeholder': 'Enter the new password',
      'recovery.password.hint': 'Use at least 8 characters, including one letter and one number.',
      'recovery.confirmPassword.label': 'Confirm new password',
      'recovery.confirmPassword.placeholder': 'Enter the new password again',
      'recovery.confirm.submit': 'Save new password',

  // Profile
  'profile.title': 'My account | LensClick',
  'profile.eyebrow': 'Account settings',
  'profile.heading': 'Your account, your way',
  'profile.lead': 'Keep your details up to date and take care of your account security.',
  'profile.emailLabel': 'Email',
  'profile.email.help': 'Used to sign in and recover your account.',
  'profile.email.confirmation': 'To protect your account, confirm your current password before changing your email.',
  'profile.phoneLabel': 'Phone',
  'profile.logout': 'Log out',
  'profile.nameLabel': 'Full name',
  'profile.roleLabel': 'How do you use LensClick?',
  'profile.role.client': 'As a client',
  'profile.role.photographer': 'As a photographer',
  'profile.ageLabel': 'Age',
  'profile.optional': 'optional',
  'profile.genderLabel': 'Gender',
  'profile.gender.male': 'Male',
  'profile.gender.female': 'Female',
  'profile.gender.other': 'Prefer not to say',
  'profile.save': 'Save changes',
  'profile.personal.title': 'Personal details',
  'profile.personal.lead': 'Information used to identify you and keep in touch.',
  'profile.photo.change': 'Choose photo',
  'profile.photo.remove': 'Remove photo',
  'profile.photo.hint': 'JPG, PNG or WebP, up to 450 KB.',
  'profile.photo.dialogTitle': 'Remove profile photo?',
  'profile.photo.dialogText': 'The image will be permanently deleted. You can add another one whenever you like.',
  'profile.photo.confirm': 'Yes, remove it',
  'profile.security.title': 'Password and security',
  'profile.security.lead': 'Use a unique password that you do not use for other services.',
  'profile.currentPassword': 'Current password',
  'profile.newPassword': 'New password',
  'profile.confirmPassword': 'Confirm new password',
  'profile.password.rules': 'Use at least 8 characters, including one letter and one number.',
  'profile.password.sessions': 'When you change your password, we will sign you out on other devices.',
  'profile.password.submit': 'Update password',
  'profile.cancel': 'Cancel',
  'profile.backToSite': 'Back to site',

  // About
  'about.title': 'ABOUT <span class="gradient-text">US</span>',
  'about.historyTitle': 'OUR <span class="gradient-text">HISTORY</span>',
  'about.p1': 'Lens Click was founded in 2025 by a group of students who saw how difficult it could be to find and choose the right photography service. The site was created to make that decision simpler.',
  'about.p2': 'Before we photograph, we listen to what you want to remember. Then we take care of the direction, light and details to create images that feel like you.',

  // Stats
  'stats.projects': 'Projects completed',
  'stats.months': 'Months of experience',
  'stats.couples': 'Happy couples',
  'stats.events': 'Events covered',

  // Services
  'services.portrait': 'Portrait Sessions',
  'services.from': 'From',
  'services.portrait.f1': '1h session',
  'services.portrait.f2': '20 edited photos',
  'services.portrait.f3': 'Pose guidance',
  'services.portrait.f4': 'Location of choice',
  'services.wedding': 'Wedding Photography',
  'services.wedding.f1': 'Coverage',
  'services.wedding.f2': 'Digital album',
  'services.wedding.f3': 'Candid photos',
  'services.wedding.f4': 'Post-wedding session',
  'services.events': 'Event Photography',
  'services.range': 'Between',
  'services.events.f1': 'Full coverage',
  'services.events.f2': 'High-resolution photos',
  'services.events.f3': 'Online gallery',
  'services.events.f4': 'Full support',
  'services.commercial': 'Commercial Photography',
  'services.commercial.f1': 'Product photos',
  'services.commercial.f2': 'Corporate packages',
  'services.commercial.f3': 'Commercial shoots',
  'services.commercial.f4': 'Commercial use',
  'services.request': 'Request quote',

  // Quotes
  'quotes.q1': '"Your moment, without forced poses."',
  'quotes.q2': '"Guidance when you need it."',
  'quotes.q3': '"The little details deserve a photo too."',
  'quotes.q4': '"You live it. We capture it."',

  // Portfolio filters
  'filter.all': 'All',
  'filter.retratos': 'Portraits',
  'filter.weddings': 'Weddings',
  'filter.events': 'Events',
  'filter.commercial': 'Commercial',

  // Reviews
  'reviews.title': 'REVIEWS',

  // Portfolio lead
  'portfolio.lead': 'Explore a selection of <b><span class="gradient-text">portraits, weddings and events</span></b>, along with Lens Click’s <b><span class="gradient-text">commercial work</span></b>.',

  // Contact / Form
  'contact.title': 'LET’S <span class="gradient-text">TALK</span>',
  'contact.lead': 'Tell us what you’re planning. We’ll reply with availability, next steps and a clear quote.',
  'contact.form.selectService': 'Select desired service',
  'contact.info.locationLabel': 'Location',
  'contact.info.location': 'São Paulo, SP',
  'contact.hoursTitle': 'HOURS OF <span class="gradient-text">OPERATION</span>',
  'contact.studiosTitle': 'OUR <span class="gradient-text">STUDIOS</span>',

  // Newsletter / footer
  'newsletter.title': 'THE LATEST FROM <span class="gradient-text">LENS CLICK</span>',
  'newsletter.lead': 'Behind-the-scenes notes, tips and Lens Click updates, delivered to your inbox.',
  'newsletter.specials': 'Occasionally, we also send subscriber-only offers.',
  'newsletter.tipTitle': 'Subscriber perks',
  'newsletter.tipLead': 'Subscriber-only offers',
  'newsletter.proTitle': 'Practical tips',
  'newsletter.proLead': 'Simple guidance for better photos',
  'newsletter.firstTitle': 'First look',
  'newsletter.firstLead': 'New work and services',
  'newsletter.cta': 'Sign up and receive our free guide, “10 Practical Tips for Better Photos.”',
  'newsletter.submit': 'KEEP ME POSTED',
  'newsletter.emailPlaceholder': 'you@email.com',
  'newsletter.privacyNote': 'Your email will be used only to manage your subscription.',

  // FAQ
  'faq.title': 'FREQUENT <span class="gradient-text">QUESTIONS</span>',
  'faq.q1': 'What is the delivery time?',
  'faq.a1': 'Between 7 and 20 business days, depending on the service and number of photos.',
  'faq.q2': 'How does payment work?',
  'faq.a2': 'We accept PIX, card and bank slip. Usually 30% at booking and the remainder on delivery.',
  'faq.q3': 'Can I choose which photos will be edited?',
  'faq.a3': 'Yes! We send a gallery for selection and, from it, proceed with final editing.',
  'faq.q4': 'Do you offer physical and virtual albums?',
  'faq.a4': 'We offer both. We have different formats and finishes for you to choose.',
  'faq.q5': 'How are the photos delivered?',
  'faq.a5': 'Via an online gallery with a protected link and download option. For premium packages, also on a USB drive.',
  'faq.q6': 'Do you have insurance for equipment?',
  'faq.a6': 'Yes, all our equipment is insured to ensure continuity of work.',
  'faq.q7': 'Do you do outdoor sessions?',
  'faq.a7': 'Yes. We can suggest locations or shoot at a place of your choice.',
  'faq.q8': 'How do I schedule a session?',
  'faq.a8': 'Contact us via the form with the desired date. We confirm availability and finalize details.',

  // Privacy / Terms
  'privacy.title': 'Privacy Policy',
  'privacy.back': 'Back to site',
  'terms.title': 'Terms of Use',
  'terms.back': 'Back to site'
      ,
      // Reviews
      'review.r1.name': 'Maurício and Maria — Wedding',
      'review.r1.text': 'Lens Click perfectly captured the magic of our wedding. Each photo tells a story and still moves us today. Exceptional professionalism and talent!',
      'review.r2.name': 'TechStart — Corporate Photography',
      'review.r2.text': 'We needed professional photos for our team and the result exceeded all expectations. We highly recommend them!',
      'review.r3.name': 'Marina Mendes — Individual Session',
      'review.r3.text': 'An amazing experience! I felt confident and the photos turned out wonderful.',
      'review.r4.name': 'Rafael and Sofia — Pre-wedding',
      'review.r4.text': 'The pre-wedding shoot was amazing! The team made us feel very comfortable and the photos were breathtaking.'
    }
  };

  function getInitialLang(){
    const saved = localStorage.getItem('lang');
    if(saved) return saved;
    const nav = (navigator.language || navigator.userLanguage || 'pt').toLowerCase();
    return nav.startsWith('en') ? 'en' : 'pt';
  }

  let lang = getInitialLang();
  const originalValues = new WeakMap();

  function copyrightYear(){
    const currentYear = new Date().getFullYear();
    return currentYear > 2025 ? `2025–${currentYear}` : '2025';
  }

  function t(key){
    const value = (translations[lang] && translations[lang][key]) || '';
    return value.replaceAll('{year}', copyrightYear());
  }

  function captureOriginalValues(){
    document.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria], [data-i18n-section]').forEach(el=>{
      originalValues.set(el, {
        html: el.innerHTML,
        text: el.textContent,
        placeholder: el.getAttribute('placeholder') || '',
        title: el.getAttribute('title') || '',
        aria: el.getAttribute('aria-label') || '',
        section: el.getAttribute('data-section') || ''
      });
    });
  }

  function translatedOrOriginal(el, key, type){
    const translated = t(key);
    if(translated) return translated;
    const original = originalValues.get(el);
    return original ? original[type] : '';
  }

  function applyTranslations(){
    // Animation: fade out -> update -> fade in

    // Troca 'a' por 'to' nos preços quando em inglês
    document.querySelectorAll('.price-sep').forEach(function(sep){
      sep.textContent = (lang === 'en') ? 'and' : 'a';
    });
    const elems = Array.from(document.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-section], title[data-i18n]'));

    // Apply fade-out styles
    elems.forEach(el=>{
      el.classList.add('i18n-transitioning');
      el.style.transition = 'opacity .28s ease, transform .28s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
    });

    // After fade-out, update content and fade-in
    setTimeout(()=>{
      // elements with data-i18n
      document.querySelectorAll('[data-i18n]').forEach(el=>{
        const key = el.getAttribute('data-i18n');
        if(!key) return;
        if(el.getAttribute('data-i18n-html') === 'true'){
          el.innerHTML = translatedOrOriginal(el, key, 'html');
        } else {
          el.textContent = translatedOrOriginal(el, key, 'text');
        }
      });

      // placeholders
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
        const key = el.getAttribute('data-i18n-placeholder');
        if(!key) return;
        el.placeholder = translatedOrOriginal(el, key, 'placeholder');
      });

      // title attributes (e.g., small buttons/tooltips)
      document.querySelectorAll('[data-i18n-title]').forEach(el=>{
        const key = el.getAttribute('data-i18n-title');
        if(!key) return;
        el.title = translatedOrOriginal(el, key, 'title');
      });

      // aria-label attributes for accessibility
      document.querySelectorAll('[data-i18n-aria]').forEach(el=>{
        const key = el.getAttribute('data-i18n-aria');
        if(!key) return;
        el.setAttribute('aria-label', translatedOrOriginal(el, key, 'aria'));
      });

      // section indicators update their tooltip and accessible name
      document.querySelectorAll('[data-i18n-section]').forEach(el=>{
        const key = el.getAttribute('data-i18n-section');
        if(!key) return;
        const label = translatedOrOriginal(el, key, 'section').replace(/<[^>]*>/g, '').trim();
        el.setAttribute('data-section', label);
        el.setAttribute('aria-label', label);
      });

      // Title element
      const titleEl = document.querySelector('title[data-i18n]');
      if(titleEl){
        const key = titleEl.getAttribute('data-i18n');
        document.title = t(key) || document.title;
      }

      // document language
      document.documentElement.lang = (lang==='pt') ? 'pt-BR' : 'en-US';

      // update lang toggle UI if present (use inline SVG flags + abbreviation)
      const btn = document.getElementById('langToggle');
      if(btn){ 
        const flagSVG = {
          pt: `
            <svg class="flag-svg" width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="18" height="12" fill="#009b3a"/>
              <polygon points="9,2 2,6 9,10 16,6" fill="#ffdf00"/>
              <circle cx="9" cy="6" r="2.4" fill="#002776"/>
            </svg>
          `,
          en: `
            <svg class="flag-svg" width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="18" height="12" fill="#b22234"/>
              <rect y="1.2" width="18" height="1.2" fill="#fff"/>
              <rect y="3.6" width="18" height="1.2" fill="#fff"/>
              <rect y="6.0" width="18" height="1.2" fill="#fff"/>
              <rect y="8.4" width="18" height="1.2" fill="#fff"/>
              <rect x="0" y="0" width="7" height="5" fill="#3c3b6e"/>
            </svg>
          `
        };

        const abbr = (lang === 'pt') ? 'PT' : 'EN';
        btn.innerHTML = `${flagSVG[lang]} <span class="abbr">${abbr}</span>`;
        btn.setAttribute('aria-label', lang === 'pt' ? 'Trocar idioma' : 'Toggle language');
      }

      // fade-in
      elems.forEach(el=>{
        el.style.opacity = '1';
        el.style.transform = 'none';
        setTimeout(()=>{
          el.style.transition = '';
          el.classList.remove('i18n-transitioning');
        }, 350);
      });

      // notify other scripts that translations were applied
      try { document.dispatchEvent(new Event('translations.updated')); } catch(e){ /* ignore */ }

    }, 220);
  }

  // toggle handler
  function toggleLang(){
    lang = (lang === 'pt') ? 'en' : 'pt';
    localStorage.setItem('lang', lang);
    applyTranslations();
  }

  // wire toggle button
  document.addEventListener('DOMContentLoaded', ()=>{
    captureOriginalValues();
    const btn = document.getElementById('langToggle');
    if(btn){ btn.addEventListener('click', toggleLang); }
    applyTranslations();
  });

})();
