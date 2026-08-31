(function () {
  const UX = window.LensClickUX;
  const t = (key, values = {}) => UX.t(key, values, key);

  function stars(rating) {
    return `${'★'.repeat(Number(rating) || 0)}${'☆'.repeat(5 - (Number(rating) || 0))}`;
  }

  function statusLabel(status) {
    return t(`reputation.status.${status}`);
  }

  function element(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  async function loadPublicReputation() {
    const list = document.getElementById('publicReviewsList');
    if (!list) return;
    const slug = new URLSearchParams(window.location.search).get('perfil') || '';
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) return;
    const empty = document.getElementById('reviewsEmpty');
    const summaryElement = document.getElementById('reviewsSummary');
    try {
      const { data } = await UX.apiFetch(`/api/photographers/${encodeURIComponent(slug)}/reviews`, {
        headers: { Accept: 'application/json' }
      }, t('reputation.loadError'));
      list.replaceChildren();
      const summary = data.summary || { total: 0, average: null };
      summaryElement.textContent = summary.total
        ? t('reputation.summary', { average: Number(summary.average).toFixed(1), total: summary.total })
        : '';
      empty.hidden = Boolean(summary.total);
      (data.reviews || []).forEach((review) => {
        const card = element('article', 'review-card');
        card.setAttribute('role', 'listitem');
        const header = element('header');
        const name = element('strong', '', review.clientName);
        const rating = element('span', 'review-stars', stars(review.rating));
        rating.setAttribute('aria-label', t('reputation.ratingLabel', { rating: review.rating }));
        const comment = element('p', '', review.comment);
        header.append(name, rating);
        card.append(header, comment);
        list.append(card);
      });
    } catch (error) {
      UX.showMessage(empty, error.message, 'error');
    }

    const requestForm = document.getElementById('reviewRequestForm');
    try {
      const { data } = await UX.apiFetch('/api/auth/me', { headers: { Accept: 'application/json' } });
      requestForm.hidden = data.user?.role !== 'client';
    } catch { requestForm.hidden = true; }

    if (requestForm.dataset.bound === 'true') return;
    requestForm.dataset.bound = 'true';
    requestForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!requestForm.reportValidity()) return;
      const button = document.getElementById('reviewRequestButton');
      const message = document.getElementById('reviewRequestMessage');
      const feedback = document.getElementById('reviewRequestMsg');
      UX.setBusy(button, true);
      try {
        const { data } = await UX.apiFetch(`/api/photographers/${encodeURIComponent(slug)}/review-requests`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.value.trim() })
        }, t('reputation.request.error'));
        requestForm.reset();
        UX.showMessage(feedback, data.message, 'success');
      } catch (error) { UX.showMessage(feedback, error.message, 'error'); }
      finally { UX.setBusy(button, false); }
    });
  }

  function reviewEditor(request, reload) {
    const form = element('form', 'review-editor');
    const rating = element('select');
    rating.setAttribute('aria-label', t('reputation.editor.rating'));
    for (let value = 5; value >= 1; value -= 1) {
      const option = element('option', '', `${value} — ${stars(value)}`);
      option.value = String(value);
      option.selected = Number(request.review?.rating || 5) === value;
      rating.append(option);
    }
    const comment = element('textarea');
    comment.minLength = 10;
    comment.maxLength = 1000;
    comment.required = true;
    comment.placeholder = t('reputation.editor.comment');
    comment.value = request.review?.comment || '';
    const submit = element('button', 'primary-button', request.review ? t('reputation.editor.update') : t('reputation.editor.publish'));
    submit.type = 'submit';
    form.append(rating, comment, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      UX.setBusy(submit, true);
      try {
        await UX.apiFetch(request.review
          ? `/api/account/reviews/${request.review.id}`
          : `/api/account/review-requests/${request.id}/review`, {
          method: request.review ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: Number(rating.value), comment: comment.value.trim() })
        }, t('reputation.editor.error'));
        await reload();
      } catch (error) { window.alert(error.message); UX.setBusy(submit, false); }
    });
    return form;
  }

  async function loadDashboard() {
    const list = document.getElementById('reputationRequestList');
    if (!list) return;
    const empty = document.getElementById('reputationDashboardEmpty');
    const feedback = document.getElementById('reputationDashboardMsg');
    try {
      const { data } = await UX.apiFetch('/api/account/review-requests', { headers: { Accept: 'application/json' } }, t('reputation.dashboard.error'));
      list.replaceChildren();
      empty.hidden = Boolean(data.requests?.length);
      (data.requests || []).forEach((request) => {
        const card = element('article', 'reputation-request-card');
        const header = element('header');
        const name = element('strong', '', data.role === 'photographer' ? request.clientName : request.photographerName);
        const status = element('span', 'status-pill', statusLabel(request.status));
        header.append(name, status);
        card.append(header, element('p', '', request.message));
        if (data.role === 'photographer' && request.status === 'pending') {
          const actions = element('div', 'reputation-actions');
          [['confirmed', 'reputation.confirm'], ['rejected', 'reputation.reject']].forEach(([nextStatus, key]) => {
            const button = element('button', nextStatus === 'confirmed' ? 'primary-button' : 'secondary-button', t(key));
            button.type = 'button';
            button.addEventListener('click', async () => {
              UX.setBusy(button, true);
              try {
                await UX.apiFetch(`/api/account/review-requests/${request.id}`, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus })
                });
                await loadDashboard();
              } catch (error) { UX.showMessage(feedback, error.message, 'error'); UX.setBusy(button, false); }
            });
            actions.append(button);
          });
          card.append(actions);
        }
        if (data.role === 'client' && request.status === 'confirmed' && request.review?.status !== 'deleted') {
          card.append(reviewEditor(request, loadDashboard));
          if (request.review) {
            const remove = element('button', 'danger-outline-button', t('reputation.editor.delete'));
            remove.type = 'button';
            remove.addEventListener('click', async () => {
              if (!window.confirm(t('reputation.editor.deleteConfirm'))) return;
              try { await UX.apiFetch(`/api/account/reviews/${request.review.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' }); await loadDashboard(); }
              catch (error) { UX.showMessage(feedback, error.message, 'error'); }
            });
            card.append(remove);
          }
        }
        list.append(card);
      });
    } catch (error) {
      if (error.status === 401) return;
      UX.showMessage(feedback, error.message, 'error');
    }
  }

  loadPublicReputation();
  loadDashboard();
  document.addEventListener('translations.updated', () => { if (document.getElementById('publicReviewsList')) loadPublicReputation(); });
})();
