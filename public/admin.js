const message = document.getElementById('adminMessage');
const overviewSection = document.getElementById('adminOverview');
const reviewsSection = document.getElementById('adminReviews');
const conversationsSection = document.getElementById('adminConversations');
const UX = window.LensClickUX;

async function api(path, options) {
  return UX.apiFetch(path, options, UX.t('admin.error'));
}

function showSections(visible) {
  for (const section of [overviewSection, reviewsSection, conversationsSection]) {
    section.hidden = !visible;
  }
}

function renderOverview(overview) {
  const list = document.getElementById('overviewList');
  list.innerHTML = '';
  for (const [key, value] of Object.entries(overview)) {
    const item = document.createElement('li');
    item.textContent = `${UX.t(`admin.metric.${key}`)}: ${value}`;
    list.appendChild(item);
  }
}

function actionButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'recovery-link';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function renderReviews(reviews) {
  const list = document.getElementById('reviewsList');
  list.innerHTML = '';
  if (!reviews.length) {
    const empty = document.createElement('p');
    empty.textContent = UX.t('admin.reviewsEmpty');
    list.appendChild(empty);
    return;
  }
  for (const review of reviews) {
    const card = document.createElement('article');
    const title = document.createElement('p');
    title.textContent = `${review.photographerName} · ${review.rating}/5 · ${review.status}`;
    const body = document.createElement('p');
    body.textContent = review.comment;
    const author = document.createElement('p');
    author.textContent = UX.t('admin.reviewAuthor', { name: review.clientName });
    card.append(title, body, author);
    if (review.status === 'active') {
      card.appendChild(actionButton(UX.t('admin.moderate'), async () => {
        const reason = window.prompt(UX.t('admin.moderateReason')) || '';
        await api(`/api/admin/reviews/${review.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'moderate', reason })
        });
        await load();
      }));
    }
    if (review.status === 'moderated') {
      card.appendChild(actionButton(UX.t('admin.restore'), async () => {
        await api(`/api/admin/reviews/${review.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore' })
        });
        await load();
      }));
    }
    list.appendChild(card);
  }
}

function renderConversations(conversations) {
  const list = document.getElementById('conversationsList');
  list.innerHTML = '';
  if (!conversations.length) {
    const empty = document.createElement('p');
    empty.textContent = UX.t('admin.conversationsEmpty');
    list.appendChild(empty);
    return;
  }
  for (const conversation of conversations) {
    const card = document.createElement('article');
    const title = document.createElement('p');
    title.textContent = `${conversation.clientName} ↔ ${conversation.photographerName} · ${conversation.status}`;
    card.appendChild(title);
    const action = conversation.status === 'active' ? 'close' : 'reopen';
    card.appendChild(actionButton(UX.t(`admin.${action}`), async () => {
      await api(`/api/admin/conversations/${conversation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      await load();
    }));
    list.appendChild(card);
  }
}

async function load() {
  const [overview, reviews, conversations] = await Promise.all([
    api('/api/admin/overview'),
    api('/api/admin/reviews?status=all&limit=20'),
    api('/api/admin/conversations?status=all&limit=20')
  ]);
  renderOverview(overview.overview);
  renderReviews(reviews.reviews);
  renderConversations(conversations.conversations);
  showSections(true);
}

(async function init() {
  try {
    const me = await api('/api/auth/me');
    if (!me.user || me.user.isAdmin !== true) {
      UX.showMessage(message, UX.t('admin.forbidden'), 'error');
      return;
    }
    await load();
  } catch (error) {
    const key = error.status === 401 || error.status === 403 ? 'admin.forbidden' : 'admin.error';
    UX.showMessage(message, UX.t(key), 'error');
  }
})();
