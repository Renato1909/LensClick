(function () {
  const UX = window.LensClickUX;
  const t = (key, values = {}, fallback = key) => UX.t(key, values, fallback);
  let currentUser = null;
  let conversations = [];
  let activeConversation = null;
  let nextBefore = null;
  let currentMessages = [];

  function slugFromLocation() {
    const match = window.location.pathname.match(/^\/fotografo\/([a-z0-9-]{3,80})\/?$/);
    return match?.[1] || new URLSearchParams(window.location.search).get('perfil') || '';
  }

  function initials(name) {
    return String(name || 'LC').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  }

  function formatDate(value) {
    const date = new Date(String(value || '').replace(' ', 'T') + (String(value || '').includes('Z') ? '' : 'Z'));
    return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat(window.i18n?.getLocale?.() || 'pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  async function initializeStartForm() {
    const form = document.getElementById('conversationStartForm');
    if (!form) return;
    const slug = slugFromLocation();
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) return;
    try {
      const { data } = await UX.apiFetch('/api/auth/me', { headers: { Accept: 'application/json' } });
      form.hidden = data.user?.role !== 'client';
    } catch { form.hidden = true; }
    if (form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = document.getElementById('conversationStartButton');
      const field = document.getElementById('conversationStartMessage');
      const feedback = document.getElementById('conversationStartFeedback');
      UX.setBusy(button, true);
      try {
        const { data } = await UX.apiFetch(`/api/photographers/${encodeURIComponent(slug)}/conversations`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: field.value.trim() })
        }, t('messaging.start.error'));
        window.location.assign(`/perfil.html?conversa=${encodeURIComponent(data.conversation.id)}#messages`);
      } catch (error) {
        UX.showMessage(feedback, error.message, 'error');
        UX.setBusy(button, false);
      }
    });
  }

  function messageBubble(message) {
    const article = document.createElement('article');
    article.className = `message-bubble${Number(message.senderUserId) === Number(currentUser.id) ? ' is-own' : ''}`;
    const body = document.createElement('p');
    body.textContent = message.body;
    const time = document.createElement('time');
    time.dateTime = message.createdAt;
    time.textContent = formatDate(message.createdAt);
    article.append(body, time);
    return article;
  }

  function renderMessages(messages, prepend = false) {
    const list = document.getElementById('messageList');
    const fragment = document.createDocumentFragment();
    messages.forEach((message) => fragment.append(messageBubble(message)));
    if (prepend) {
      currentMessages = [...messages, ...currentMessages];
      list.prepend(fragment);
    }
    else {
      currentMessages = [...messages];
      list.replaceChildren(fragment);
      list.scrollTop = list.scrollHeight;
    }
  }

  function renderConversationList() {
    const list = document.getElementById('conversationList');
    const empty = document.getElementById('conversationListEmpty');
    list.replaceChildren();
    empty.hidden = conversations.length > 0;
    conversations.forEach((conversation) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'conversation-card';
      button.setAttribute('aria-current', String(conversation.id === activeConversation?.id));
      const avatar = document.createElement('span');
      avatar.className = 'conversation-avatar';
      avatar.textContent = initials(conversation.counterpart.name);
      const copy = document.createElement('span');
      copy.className = 'conversation-card-copy';
      const name = document.createElement('strong');
      name.textContent = conversation.counterpart.name;
      const preview = document.createElement('span');
      preview.textContent = conversation.lastMessage || t('messaging.dashboard.noPreview');
      copy.append(name, preview);
      button.append(avatar, copy);
      if (conversation.unreadCount) {
        const unread = document.createElement('span');
        unread.className = 'conversation-unread';
        unread.textContent = conversation.unreadCount > 99 ? '99+' : String(conversation.unreadCount);
        unread.setAttribute('aria-label', t('messaging.dashboard.unread', { count: conversation.unreadCount }));
        button.append(unread);
      }
      button.addEventListener('click', () => openConversation(conversation.id).catch((error) => {
        UX.showMessage(document.getElementById('messagingDashboardFeedback'), error.message, 'error');
      }));
      list.append(button);
    });
  }

  async function openConversation(id) {
    activeConversation = conversations.find((item) => item.id === Number(id));
    if (!activeConversation) return;
    document.getElementById('conversationPlaceholder').hidden = true;
    document.getElementById('conversationActive').hidden = false;
    document.getElementById('conversationThreadTitle').textContent = activeConversation.counterpart.name;
    const profileLink = document.getElementById('conversationProfileLink');
    profileLink.hidden = !activeConversation.counterpart.slug;
    if (!profileLink.hidden) profileLink.href = `/fotografo/${encodeURIComponent(activeConversation.counterpart.slug)}`;
    renderConversationList();
    const { data } = await UX.apiFetch(`/api/account/conversations/${activeConversation.id}/messages?pageSize=50`, {
      headers: { Accept: 'application/json' }
    }, t('messaging.dashboard.loadError'));
    nextBefore = data.pagination.nextBefore;
    document.getElementById('loadOlderMessages').hidden = !data.pagination.hasMore;
    renderMessages(data.messages || []);
    await UX.apiFetch(`/api/account/conversations/${activeConversation.id}/read`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }, t('messaging.dashboard.readError'));
    activeConversation.unreadCount = 0;
    renderConversationList();
    const url = new URL(window.location.href);
    url.searchParams.set('conversa', String(activeConversation.id));
    window.history.replaceState({}, '', `${url.pathname}${url.search}#messages`);
  }

  async function loadConversations() {
    const feedback = document.getElementById('messagingDashboardFeedback');
    try {
      const [userResult, inboxResult] = await Promise.all([
        UX.apiFetch('/api/auth/me', { headers: { Accept: 'application/json' } }),
        UX.apiFetch('/api/account/conversations?pageSize=50', { headers: { Accept: 'application/json' } }, t('messaging.dashboard.loadError'))
      ]);
      currentUser = userResult.data.user;
      conversations = inboxResult.data.conversations || [];
      renderConversationList();
      const requestedId = Number(new URLSearchParams(window.location.search).get('conversa'));
      if (requestedId && conversations.some(({ id }) => id === requestedId)) await openConversation(requestedId);
    } catch (error) { UX.showMessage(feedback, error.message, 'error'); }
  }

  function bindDashboard() {
    const dashboard = document.getElementById('messagingDashboard');
    if (!dashboard || dashboard.dataset.bound === 'true') return;
    dashboard.dataset.bound = 'true';
    document.getElementById('loadOlderMessages').addEventListener('click', async () => {
      if (!activeConversation || !nextBefore) return;
      const button = document.getElementById('loadOlderMessages');
      UX.setBusy(button, true);
      try {
        const { data } = await UX.apiFetch(`/api/account/conversations/${activeConversation.id}/messages?pageSize=50&before=${nextBefore}`);
        nextBefore = data.pagination.nextBefore;
        button.hidden = !data.pagination.hasMore;
        renderMessages(data.messages || [], true);
      } catch (error) {
        UX.showMessage(document.getElementById('messagingDashboardFeedback'), error.message, 'error');
      } finally { UX.setBusy(button, false); }
    });
    document.getElementById('messageReplyForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!activeConversation || !event.currentTarget.reportValidity()) return;
      const field = document.getElementById('messageReply');
      const button = document.getElementById('messageReplyButton');
      UX.setBusy(button, true);
      try {
        const { data } = await UX.apiFetch(`/api/account/conversations/${activeConversation.id}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: field.value.trim() })
        }, t('messaging.dashboard.sendError'));
        field.value = '';
        const list = document.getElementById('messageList');
        list.append(messageBubble(data.message));
        currentMessages.push(data.message);
        list.scrollTop = list.scrollHeight;
        activeConversation.lastMessage = data.message.body;
        activeConversation.lastMessageAt = data.message.createdAt;
        renderConversationList();
      } catch (error) { UX.showMessage(document.getElementById('messagingDashboardFeedback'), error.message, 'error'); }
      finally { UX.setBusy(button, false); }
    });
    loadConversations();
  }

  document.addEventListener('translations.updated', () => {
    if (document.getElementById('conversationList')) renderConversationList();
    if (currentMessages.length) renderMessages(currentMessages);
  });
  Promise.resolve(window.i18n?.ready).then(() => {
    initializeStartForm();
    bindDashboard();
  });
})();
