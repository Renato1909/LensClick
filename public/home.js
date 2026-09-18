const UX = window.LensClickUX;
// Mobile menu toggle
const menuBtn = document.getElementById('menuBtn');
const menuList = document.getElementById('menuList');
const authBtns = document.getElementById('authBtns');
const mobileAuthBtns = document.querySelector('.mobile-auth-btns');
function setMenuOpen(open, returnFocus = false) {
  menuList.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open
    ? UX.t('nav.menu.close')
    : UX.t('nav.menu.open'));
  menuBtn.innerHTML = open
    ? '<i class="fas fa-times" aria-hidden="true"></i>'
    : '<i class="fas fa-bars" aria-hidden="true"></i>';
  if (mobileAuthBtns) mobileAuthBtns.style.display = open && window.innerWidth <= 880 ? 'flex' : 'none';
  if (!open && returnFocus) menuBtn.focus();
}

menuBtn?.addEventListener('click',()=>setMenuOpen(!menuList.classList.contains('open')));

// Garante que os botões móveis sejam recolhidos no desktop
window.addEventListener('resize',()=>{
  if(window.innerWidth > 880){
    setMenuOpen(false);
  }
});

// Header scroll effect
const header = document.getElementById('mainHeader');

window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
}, { passive: true });

// Smooth scroll for anchors & custom buttons
function smoothTo(hash, moveFocus = false){
  const el = document.querySelector(hash);
  if(!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - 64;
  window.scrollTo({top:y, behavior: UX.prefersReducedMotion() ? 'auto' : 'smooth'});
  setMenuOpen(false);
  if (moveFocus) {
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    history.replaceState(null, '', hash);
  }

  // Atualizar indicador de seção
  updateSectionIndicator(hash.substring(1));
}
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click',e=>{
    if(a.getAttribute('href')!=='#'){
      e.preventDefault();
      smoothTo(a.getAttribute('href'), true);
    }
  });
});
document.querySelectorAll('[data-scroll]').forEach(btn=>btn.addEventListener('click',()=>{
  if (btn.dataset.serviceIndex) {
    activateContactTab('form');
    const serviceSelect = document.querySelector('#contactForm select[name="tipo"]');
    serviceSelect.selectedIndex = Number(btn.dataset.serviceIndex);
    serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    UX.highlight(serviceSelect);
  }
  smoothTo(btn.dataset.scroll);
}));

// Navegação por pontos de seção
const sectionDots = document.querySelectorAll('.section-dot');
function updateSectionIndicator(sectionId) {
  sectionDots.forEach(dot => {
    const active = dot.getAttribute('data-target') === sectionId;
    dot.classList.toggle('active', active);
    if (active) dot.setAttribute('aria-current', 'true');
    else dot.removeAttribute('aria-current');
  });
}

sectionDots.forEach(dot => {
  dot.addEventListener('click', () => {
    smoothTo('#' + dot.getAttribute('data-target'));
  });
});

// Active nav on scroll
const sections = ['home','sobre','servicos','portfolio','contato','avaliacoes','faq'].map(id=>document.getElementById(id));
const navLinks = Array.from(document.querySelectorAll('nav a'));
function setActive(){
  let current='home';
  const offset = 110;
  sections.forEach(sec=>{
    if(sec && window.scrollY + offset >= sec.offsetTop) current = sec.id;
  });
  navLinks.forEach(a=>{
    const active = a.getAttribute('href')==='#'+current;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  updateSectionIndicator(current);
}
window.addEventListener('scroll', setActive, { passive: true });
setActive();

// Reveal on scroll
const io = new IntersectionObserver((entries)=>{
  for(const e of entries){
    if(e.isIntersecting){
      e.target.classList.add('reveal');
      io.unobserve(e.target);
    }
  }
}, {threshold:.12});
document.querySelectorAll('[data-reveal]').forEach(el=>io.observe(el));

// Counters
function animateCounter(el){
  const target = parseInt(el.dataset.counter,10) || 0;
  const plus = el.hasAttribute('data-plus');
  if (UX.prefersReducedMotion()) {
    el.textContent = target + (plus ? '+' : '');
    return;
  }
  const start = 0;
  const duration = 1000;
  const t0 = performance.now();
  function step(t){
    const p = Math.min(1, (t - t0)/duration);
    const val = Math.round(start + (target - start) * p);
    el.textContent = val + (plus && p===1 ? '+':'');
    if(p<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
const counters = document.querySelectorAll('[data-counter]');
const io2 = new IntersectionObserver((entries)=>{
  for(const e of entries){
    if(e.isIntersecting){
      animateCounter(e.target);
      io2.unobserve(e.target);
    }
  }
}, {threshold:.6});
counters.forEach(c=>io2.observe(c));

// Portfolio filters
const chips = document.querySelectorAll('.chip');
const items = document.querySelectorAll('#portfolioGrid .item');
function updatePortfolioAccessibility() {
  const categories = {
    retratos: UX.t('portfolio.category.portrait'),
    casamentos: UX.t('portfolio.category.wedding'),
    eventos: UX.t('portfolio.category.event'),
    comercial: UX.t('portfolio.category.product')
  };
  items.forEach(item => {
    const categoryKey = Object.keys(categories).find(key => item.classList.contains(key));
    const category = categories[categoryKey] || UX.t('portfolio.category.photo');
    const thumbnail = item.querySelector('img');
    if (thumbnail) thumbnail.alt = category;
    item.setAttribute('aria-label', UX.t('portfolio.openPhoto', { category }));
  });
}
updatePortfolioAccessibility();

chips.forEach(ch=>ch.addEventListener('click', ()=>{
  chips.forEach(c=>{
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });
  ch.classList.add('active');
  ch.setAttribute('aria-pressed', 'true');
  const f = ch.dataset.filter;
  items.forEach(it=>{
    it.style.display = (f==='all' || it.classList.contains(f)) ? 'block':'none';
  });
}));

// Portfolio modal
const modal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImage');
const modalClose = document.getElementById('modalClose');
let modalTrigger = null;

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  modalTrigger?.focus();
}

items.forEach(item => {
  const thumbnail = item.querySelector('img');
  item.setAttribute('tabindex', '0');
  item.setAttribute('role', 'button');
  item.addEventListener('click', () => {
    modalTrigger = item;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modalImg.src = item.getAttribute('data-src');
    modalImg.alt = thumbnail?.alt || UX.t('portfolio.enlargedAlt');
    document.body.style.overflow = 'hidden';
    modalClose.focus();
  });
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      item.click();
    }
  });
});

modalClose.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    closeModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && modal.classList.contains('open')) {
    event.preventDefault();
    modalClose.focus();
    return;
  }
  if (event.key !== 'Escape') return;
  if (modal.classList.contains('open')) closeModal();
  if (menuList.classList.contains('open')) setMenuOpen(false, true);
});

// FAQ accordion
const faqItems = document.querySelectorAll('.faq-item');
function updateFaqLabels() {
  faqItems.forEach((it, index)=>{
    const btn = it.querySelector('.menu-btn');
    const answer = it.querySelector('.faq-a');
    const question = it.querySelector('h4')?.textContent?.trim() || '';
    const open = it.classList.contains('open');
    const answerId = `faq-answer-${index + 1}`;
    answer.id = answerId;
    answer.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-controls', answerId);
    btn.setAttribute('aria-label', UX.t(open ? 'faq.answer.hide' : 'faq.answer.show', { question }));
  });
}

faqItems.forEach(it=>{
  const btn = it.querySelector('.menu-btn');
  btn.setAttribute('aria-expanded', 'false');
  btn.querySelector('i')?.setAttribute('aria-hidden', 'true');
  it.querySelector('.faq-q').addEventListener('click',()=>{
    it.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(it.classList.contains('open')));
    btn.innerHTML = it.classList.contains('open') ?
      '<i class="fas fa-times" aria-hidden="true"></i>' : '<i class="fas fa-plus" aria-hidden="true"></i>';
    updateFaqLabels();
  });
});
updateFaqLabels();

// Envio real do formulário para o servidor
document.getElementById('contactForm').addEventListener('submit', async (event)=>{
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const message = document.getElementById('formMsg');
  const fields = new FormData(form);
  UX.showMessage(message, '');
  UX.setBusy(button, true, { pt: 'Enviando...', en: 'Sending...' });
  try {
    await UX.apiFetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fields.get('nome'), phone: fields.get('tel'), email: fields.get('email'),
        serviceType: fields.get('tipo'), eventDate: fields.get('data'), message: fields.get('msg')
      })
    }, UX.t('contact.form.submitError'));
    UX.showMessage(message, UX.t('contact.form.success'), 'success');
    form.reset();
  } catch (error) {
    UX.showMessage(message, error.message, 'error');
  } finally {
    UX.setBusy(button, false);
  }
});

// Back to top button
const backToTopBtn = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
  if (window.scrollY > 500) {
    backToTopBtn.classList.add('visible');
  } else {
    backToTopBtn.classList.remove('visible');
  }
}, { passive: true });

backToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: UX.prefersReducedMotion() ? 'auto' : 'smooth' });
});

// Sistema de abas na seção de contato
const contactTabs = document.querySelectorAll('.contact-tab');
const tabContents = document.querySelectorAll('.tab-content');

function activateContactTab(tabId, focus = false) {
  contactTabs.forEach(tab => {
    const active = tab.dataset.tab === tabId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.setAttribute('tabindex', active ? '0' : '-1');
    if (active && focus) tab.focus();
  });
  tabContents.forEach(content => {
    const active = content.id === `${tabId}-tab`;
    content.classList.toggle('active', active);
    content.hidden = !active;
  });
}

contactTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateContactTab(tab.dataset.tab));
  tab.addEventListener('keydown', (event) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % contactTabs.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + contactTabs.length) % contactTabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = contactTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    activateContactTab(contactTabs[nextIndex].dataset.tab, true);
  });
});
activateContactTab('form');

// Inscrição real na newsletter
document.getElementById('newsletterForm').addEventListener('submit', async (event)=>{
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const message = document.getElementById('newsletterMsg');
  UX.showMessage(message, '');
  UX.setBusy(button, true, { pt: 'Cadastrando...', en: 'Subscribing...' });
  try {
    await UX.apiFetch('/api/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: new FormData(form).get('email') })
    }, UX.t('newsletter.submitError'));
    UX.showMessage(message, UX.t('newsletter.success'), 'success');
    form.reset();
  } catch (error) {
    UX.showMessage(message, error.message, 'error');
  } finally {
    UX.setBusy(button, false);
  }
});

// Check user authentication state
(async function() {
  const authButtons = document.getElementById('authBtns');
  const userProfile = document.getElementById('userProfile');
  const headerProfilePic = document.getElementById('headerProfilePic');
  const headerDefaultIcon = document.getElementById('headerDefaultIcon');
  const headerUserName = document.getElementById('headerUserName');

  try {
    const response = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
    if (response.ok) {
      const { user } = await response.json();
      // Hide auth buttons and show profile
      authButtons.style.display = 'none';
      userProfile.style.display = 'flex';

      // Show profile picture if exists
      if (user.profilePic) {
        headerProfilePic.src = user.profilePic;
        headerProfilePic.style.display = 'block';
        headerDefaultIcon.style.display = 'none';
      } else {
        headerProfilePic.style.display = 'none';
        headerDefaultIcon.style.display = 'block';
      }
      // Set first name in header if available (truncate to fit)
      if (user.name) {
        const first = String(user.name).trim().split(/\s+/)[0];
        if (first) {
          const max = 12;
          headerUserName.textContent = first.length > max ? first.slice(0, max - 1) + '…' : first;
          headerUserName.title = first;
          headerUserName.style.display = 'inline-block';
        }
      }
    } else {
      authButtons.style.display = 'flex';
      userProfile.style.display = 'none';
    }
  } catch (error) {
    authButtons.style.display = 'flex';
    userProfile.style.display = 'none';
  }
})();

// Carousel funcionalidade
const carouselItems = document.querySelectorAll('.carousel-item');
const carouselDots = document.querySelectorAll('.carousel-dot');
let currentSlide = 0;
let slideInterval;

function updateCarouselAccessibility() {
  const total = carouselItems.length;
  const isEnglish = UX.isEnglish();
  document.querySelector('.carousel')?.setAttribute('aria-roledescription', isEnglish ? 'carousel' : 'carrossel');
  carouselItems.forEach((item, index) => {
    item.setAttribute('aria-roledescription', isEnglish ? 'slide' : 'slide');
    item.setAttribute('aria-label', isEnglish ? `${index + 1} of ${total}` : `${index + 1} de ${total}`);
  });
  carouselDots.forEach((dot, index) => {
    dot.setAttribute('aria-label', isEnglish ? `Show highlight ${index + 1}` : `Mostrar destaque ${index + 1}`);
  });
}

function showSlide(index) {
  prepareSlide(index);
  carouselItems.forEach((item, itemIndex) => {
    const active = itemIndex === index;
    item.classList.toggle('active', active);
    item.setAttribute('aria-hidden', String(!active));
    item.toggleAttribute('inert', !active);
  });
  carouselDots.forEach((dot, dotIndex) => {
    const active = dotIndex === index;
    dot.classList.toggle('active', active);
    dot.setAttribute('aria-pressed', String(active));
  });
  currentSlide = index;
}

function prepareSlide(index) {
  const item = carouselItems[index];
  const background = item?.dataset.background;
  if (!background) return;
  item.style.backgroundImage = `url("${background}")`;
  delete item.dataset.background;
}

function nextSlide() {
  let nextIndex = (currentSlide + 1) % carouselItems.length;
  showSlide(nextIndex);
}

function startCarousel() {
  if (document.hidden) return;
  clearInterval(slideInterval);
  slideInterval = setInterval(nextSlide, 5000); // Troca a cada 5 segundos
}

function stopCarousel() {
  clearInterval(slideInterval);
}

carouselDots.forEach(dot => {
  dot.addEventListener('click', () => {
    stopCarousel();
    const slideIndex = parseInt(dot.getAttribute('data-index'));
    showSlide(slideIndex);
    startCarousel();
  });
});

// Inicia o carrossel
updateCarouselAccessibility();
startCarousel();

const prepareRemainingSlides = () => carouselItems.forEach((_, index) => prepareSlide(index));
if ('requestIdleCallback' in window) {
  window.requestIdleCallback(prepareRemainingSlides, { timeout: 3000 });
} else {
  window.setTimeout(prepareRemainingSlides, 1500);
}

// Pausa ao passar o mouse
const carousel = document.querySelector('.carousel');
carousel.addEventListener('mouseenter', stopCarousel);
carousel.addEventListener('mouseleave', startCarousel);
carousel.addEventListener('focusin', stopCarousel);
carousel.addEventListener('focusout', (event) => {
  if (!carousel.contains(event.relatedTarget)) startCarousel();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCarousel();
  else startCarousel();
});
document.addEventListener('translations.updated', () => {
  UX.updateAccessibilityLabels();
  setMenuOpen(menuList.classList.contains('open'));
  updateFaqLabels();
  updatePortfolioAccessibility();
  updateCarouselAccessibility();
});
