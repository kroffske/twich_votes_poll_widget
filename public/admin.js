// Admin page controller.
//
// The script is loaded from `public/admin.html`. It owns all DOM updates for
// the operator console: widget Copy/Open, Demo + Live Channel actions, the
// Создать Twitch Poll form, and the human-readable Current Poll status panel.
//
// Server contract references (do not drift from these):
//   GET  /api/status               -> { ok, snapshot }
//   POST /api/demo/start           -> { ok, snapshot }
//   POST /api/demo/stop            -> { ok }
//   POST /api/reset                -> { ok }
//   POST /api/settings/target-channel -> { ok, snapshot }
//   POST /api/twitch/reconnect     -> { ok }
//   POST /api/twitch/recover-latest-poll -> { ok, snapshot }
//   POST /api/twitch/create-poll   -> 201 { ok, poll, snapshot }
//                                     or {error:{code,message,hint}}
//   POST /auth/logout              -> { ok }
// `requireOverlayToken` gates every mutating route; reads work without a token.

const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const base = `${location.protocol}//${location.host}`;

const DURATION_PRESETS = [30, 60, 90, 120, 180, 300, 600, 900, 1800];
const POLL_SCOPE = 'channel:manage:polls';
const MAX_CHOICES = 5;
const MIN_CHOICES = 2;

let lastSnapshot = null;
let createPollInFlight = false;
let pendingFormError = null;
let targetChannelSaveInFlight = false;

// ---------- Utilities ----------

function overlayUrl(mode, metric) {
  const qs = new URLSearchParams();
  if (token) qs.set('token', token);
  qs.set('mode', mode);
  qs.set('metric', metric);
  return `${base}/overlay?${qs.toString()}`;
}

function requestInit(method, body) {
  const init = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) init.headers['X-Overlay-Token'] = token;
  if (body !== undefined) init.body = JSON.stringify(body);
  return init;
}

function withTokenQuery(path) {
  if (!token) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}

// Generic POST that returns { ok, status, payload }. Never throws on non-ok;
// call sites pick the right UX per endpoint (e.g. create-poll wants the full
// error body, demo just wants to refresh).
async function post(path, body) {
  try {
    const response = await fetch(withTokenQuery(path), requestInit('POST', body ?? {}));
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return { ok: false, status: 0, payload: { error: { message: error.message } } };
  }
}

function formatCountdown(endsAtIso) {
  if (!endsAtIso) return null;
  const endsAt = new Date(endsAtIso).getTime();
  if (!Number.isFinite(endsAt)) return null;
  const remainingMs = endsAt - Date.now();
  if (remainingMs <= 0) return '00:00';
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
}

function setBusy(button, busyText) {
  if (!button) return () => {};
  const original = button.textContent;
  button.disabled = true;
  button.classList.add('pending');
  if (busyText) button.textContent = busyText;
  return () => {
    button.disabled = false;
    button.classList.remove('pending');
    button.textContent = original;
  };
}

function scopesFromSnapshot(snapshot) {
  const raw = snapshot?.auth?.scopes;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean);
  return [];
}

function hasPollScope(snapshot) {
  return scopesFromSnapshot(snapshot).includes(POLL_SCOPE);
}

function targetChannelLogin(snapshot) {
  return snapshot?.targetChannel?.login || '';
}

// ---------- Missing token banner ----------

function renderTokenBanner() {
  const host = document.getElementById('token-banner');
  if (!host) return;
  if (token) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  host.hidden = false;
  host.innerHTML = `
    <div class="banner warn">
      <strong>Overlay token отсутствует.</strong>
      Admin открыт без <code>?token=…</code>, поэтому любые действия отвечают 401.
      Запусти <code>npm run urls</code> и открой admin URL оттуда, либо возьми его с главной
      страницы <a href="/">/</a>.
    </div>
  `;
}

// ---------- Widgets card (W3) ----------

function wireWidgetCard(cardId, mode, metric) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const copyBtn = card.querySelector('[data-action="copy"]');
  const openBtn = card.querySelector('[data-action="open"]');
  const urlHost = card.querySelector('[data-role="url"]');

  // D18: show the full URL (including token) as a selectable muted code line so
  // operators can visually verify what they're copying.
  const url = overlayUrl(mode, metric);
  if (urlHost) urlHost.textContent = url;

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      window.open(overlayUrl(mode, metric), '_blank', 'noopener');
    });
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const currentUrl = overlayUrl(mode, metric);
      const originalText = copyBtn.textContent;
      try {
        await navigator.clipboard.writeText(currentUrl);
        copyBtn.textContent = 'Copied';
      } catch {
        copyBtn.textContent = 'Copy failed';
      }
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 1500);
    });
  }
}

// ---------- Live Channel card (W4) ----------

function renderLiveChannel(snapshot) {
  const loginLink = document.getElementById('twitch-login');
  const userDisplay = document.getElementById('twitch-user');
  const logoutBtn = document.getElementById('twitch-logout');

  const auth = snapshot?.auth;
  const authenticated = Boolean(auth?.isAuthenticated);

  if (loginLink) loginLink.hidden = authenticated;
  if (logoutBtn) logoutBtn.hidden = !authenticated;

  if (userDisplay) {
    if (authenticated) {
      const login = auth.userLogin || auth.userName || 'twitch-user';
      userDisplay.hidden = false;
      userDisplay.textContent = `@${login}`;
    } else {
      userDisplay.hidden = true;
      userDisplay.textContent = '';
    }
  }

  renderTargetChannel(snapshot);
}

function renderTargetChannel(snapshot) {
  const input = document.getElementById('target-channel-login');
  const current = document.getElementById('target-channel-current');
  const error = document.getElementById('target-channel-error');

  const login = targetChannelLogin(snapshot);
  const source = snapshot?.targetChannel?.source || null;

  if (input && document.activeElement !== input && !targetChannelSaveInFlight) {
    input.value = login;
  }
  if (current) {
    if (login) {
      const suffix = source === 'env' ? ' (from .env)' : '';
      current.textContent = `Saved target channel: @${login}${suffix}`;
    } else {
      current.textContent = 'Saved target channel: not set.';
    }
  }
  if (error && !targetChannelSaveInFlight) {
    error.textContent = error.textContent || '';
  }
}

// ---------- Scope banner (D12) ----------

function renderScopeBanner(snapshot) {
  const host = document.getElementById('scope-banner');
  if (!host) return;
  const authenticated = Boolean(snapshot?.auth?.isAuthenticated);
  const missing = authenticated && !hasPollScope(snapshot);
  if (!missing) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  host.hidden = false;
  host.innerHTML = `
    <div class="banner warn">
      Для создания poll нужен scope <code>channel:manage:polls</code>.
      <a href="/auth/login">Перелогиниться</a>.
    </div>
  `;
}

// ---------- Current Poll panel (W5 status) ----------

function renderChoicesList(poll) {
  if (!poll?.choices?.length) return '';
  const items = poll.choices.map((choice, index) => `
    <li>
      <span class="choice-title">${index + 1}. ${escapeHtml(choice.title)}</span>
      <span class="choice-votes">${choice.votes} votes</span>
    </li>
  `).join('');
  return `<ul class="choices-list">${items}</ul>`;
}

function renderChannelPointsLine(poll) {
  if (!poll || poll.source !== 'twitch-poll') return '';
  if (!poll.channelPointsVoting?.enabled) return '';
  const totals = poll.totals || {};
  return `<div class="cp-line">Channel points battle: ${totals.channelPointsVotes || 0} votes / ${totals.pointsSpent || 0} pts</div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}

function renderCurrentPoll(snapshot) {
  const host = document.getElementById('current-poll');
  if (!host) return;
  if (!snapshot) {
    host.innerHTML = `<p class="muted">Загрузка…</p>`;
    return;
  }

  const auth = snapshot.auth || {};
  const connection = snapshot.connection || {};
  const poll = snapshot.poll;
  const authorizedLogin = auth.userLogin || auth.userName || 'twitch-user';
  const targetLogin = targetChannelLogin(snapshot);
  const targetLine = targetLogin
    ? `<p class="poll-meta">Project target: <strong>@${escapeHtml(targetLogin)}</strong></p>`
    : '';

  // 1) no-auth
  if (!auth.isAuthenticated) {
    host.innerHTML = `
      ${targetLine}
      <p class="muted">Не авторизован. Используйте <strong>Live Channel → Twitch Login</strong>.</p>
    `;
    return;
  }

  const channelLine = `<p class="poll-meta">Authorized channel: <strong>@${escapeHtml(authorizedLogin)}</strong></p>`;
  const metaLines = `${channelLine}${targetLine}`;

  // 2) auth + no EventSub
  if (connection.twitch !== 'subscribed') {
    const errorLine = connection.lastError
      ? `<p class="muted">Last error: ${escapeHtml(connection.lastError)}</p>`
      : '';
    host.innerHTML = `
      ${metaLines}
      <p>Авторизован как <strong>@${escapeHtml(authorizedLogin)}</strong>. EventSub: <code>${escapeHtml(connection.twitch || 'unknown')}</code>. Нажмите <strong>Reconnect</strong>.</p>
      ${errorLine}
    `;
    return;
  }

  // 3) auth + EventSub + no poll
  if (!poll) {
    host.innerHTML = `
      ${metaLines}
      <p class="poll-meta">EventSub: connected / subscribed</p>
      <p class="muted">Ожидание голосования.</p>
    `;
    return;
  }

  const titleHtml = `<h3 style="margin:4px 0 8px;">${escapeHtml(poll.title || 'Poll')}</h3>`;

  // 6) ended poll
  if (poll.status === 'ended') {
    host.innerHTML = `
      ${metaLines}
      <p class="poll-meta">EventSub: connected / subscribed</p>
      ${titleHtml}
      <p>Status: <span class="badge ended">Закончено</span></p>
      ${renderChoicesList(poll)}
      ${renderChannelPointsLine(poll)}
      <p class="muted">Use <strong>Recover Poll</strong> or <strong>Reset</strong> for the next round.</p>
    `;
    return;
  }

  // 4) running with endsAt
  if (poll.endsAt) {
    const countdown = formatCountdown(poll.endsAt) || '00:00';
    host.innerHTML = `
      ${metaLines}
      <p class="poll-meta">EventSub: connected / subscribed</p>
      ${titleHtml}
      <p>Status: <span class="badge running">Running</span> <span class="countdown">Ends in <span id="poll-countdown">${countdown}</span></span></p>
      ${renderChoicesList(poll)}
      ${renderChannelPointsLine(poll)}
    `;
    return;
  }

  // 5) running without endsAt (custom-rewards)
  host.innerHTML = `
    ${metaLines}
    <p class="poll-meta">EventSub: connected / subscribed</p>
    ${titleHtml}
    <p>Status: <span class="badge running">Running</span></p>
    <p class="muted">Без таймера (channel points battle).</p>
    ${renderChoicesList(poll)}
    ${renderChannelPointsLine(poll)}
  `;
}

function updateCountdownTick() {
  if (document.hidden) return;
  const poll = lastSnapshot?.poll;
  if (!poll || poll.status !== 'running' || !poll.endsAt) return;
  const el = document.getElementById('poll-countdown');
  if (!el) return;
  el.textContent = formatCountdown(poll.endsAt) || '00:00';
}

// ---------- Create Live Poll form (W5) ----------

function choiceRows() {
  return Array.from(document.querySelectorAll('#create-poll-form .choice-row'));
}

function choiceInputs() {
  return Array.from(document.querySelectorAll('#create-poll-form input[name="choice"]'));
}

function makeChoiceRow(index) {
  const row = document.createElement('div');
  row.className = 'form-row choice-row';
  row.dataset.choiceIndex = String(index);

  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'choice';
  input.maxLength = 25;
  input.placeholder = `Choice ${index + 1}`;
  input.setAttribute('aria-label', `Choice ${index + 1}`);
  input.addEventListener('input', () => {
    clearInlineError(`choices[${getChoiceIndex(row)}]`);
    recomputeSubmitState();
  });
  row.appendChild(input);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'icon-remove';
  removeBtn.textContent = 'remove';
  removeBtn.setAttribute('aria-label', 'Remove choice');
  removeBtn.hidden = index < 2; // rows 1-2 never show remove
  removeBtn.addEventListener('click', () => {
    removeChoiceRow(row);
  });
  row.appendChild(removeBtn);

  const errorHost = document.createElement('div');
  errorHost.className = 'field-error';
  errorHost.dataset.errorFor = 'choice';
  row.appendChild(errorHost);

  return row;
}

function getChoiceIndex(row) {
  return choiceRows().indexOf(row);
}

function rebuildChoiceRowLabels() {
  const rows = choiceRows();
  rows.forEach((row, index) => {
    row.dataset.choiceIndex = String(index);
    const input = row.querySelector('input[name="choice"]');
    if (input) {
      input.placeholder = `Choice ${index + 1}`;
      input.setAttribute('aria-label', `Choice ${index + 1}`);
    }
    const removeBtn = row.querySelector('button.icon-remove');
    if (removeBtn) removeBtn.hidden = index < 2;
  });
  const addBtn = document.getElementById('choice-add');
  if (addBtn) addBtn.disabled = rows.length >= MAX_CHOICES;
}

function addChoiceRow() {
  const rows = choiceRows();
  if (rows.length >= MAX_CHOICES) return;
  const list = document.getElementById('choices-list');
  const newRow = makeChoiceRow(rows.length);
  list.appendChild(newRow);
  rebuildChoiceRowLabels();
  recomputeSubmitState();
}

function removeChoiceRow(row) {
  const rows = choiceRows();
  if (rows.length <= MIN_CHOICES) return;
  row.remove();
  rebuildChoiceRowLabels();
  clearAllInlineErrors();
  recomputeSubmitState();
}

function populateDurations() {
  const select = document.getElementById('poll-duration');
  if (!select) return;
  select.innerHTML = '';
  for (const seconds of DURATION_PRESETS) {
    const opt = document.createElement('option');
    opt.value = String(seconds);
    opt.textContent = seconds >= 60 ? `${Math.floor(seconds / 60)} min${seconds % 60 === 0 ? '' : ` ${seconds % 60}s`}` : `${seconds}s`;
    if (seconds === 60) opt.selected = true;
    select.appendChild(opt);
  }
}

function clearInlineError(hint) {
  if (!hint) return;
  if (hint === 'title' || hint === 'duration') {
    const el = document.querySelector(`[data-error-for="${hint}"]`);
    if (el) el.textContent = '';
    return;
  }
  if (hint === 'choices') {
    const el = document.querySelector(`[data-error-for="choices-array"]`);
    if (el) el.textContent = '';
    return;
  }
  const match = /^choices\[(\d+)\]$/.exec(hint);
  if (match) {
    const idx = Number(match[1]);
    const row = choiceRows()[idx];
    if (row) {
      const err = row.querySelector('[data-error-for="choice"]');
      if (err) err.textContent = '';
    }
  }
}

function clearAllInlineErrors() {
  document.querySelectorAll('#create-poll-form .field-error').forEach((el) => {
    el.textContent = '';
  });
  const generic = document.getElementById('create-poll-error');
  if (generic) {
    generic.hidden = true;
    generic.innerHTML = '';
  }
  pendingFormError = null;
}

function showInlineError(hint, message) {
  if (hint === 'title' || hint === 'duration') {
    const el = document.querySelector(`[data-error-for="${hint}"]`);
    if (el) el.textContent = message;
    return true;
  }
  if (hint === 'choices') {
    const el = document.querySelector(`[data-error-for="choices-array"]`);
    if (el) el.textContent = message;
    return true;
  }
  const match = typeof hint === 'string' && /^choices\[(\d+)\]$/.exec(hint);
  if (match) {
    const idx = Number(match[1]);
    const row = choiceRows()[idx];
    if (row) {
      const err = row.querySelector('[data-error-for="choice"]');
      if (err) err.textContent = message;
      return true;
    }
  }
  return false;
}

function showGenericError(html) {
  const host = document.getElementById('create-poll-error');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = html;
}

function recomputeSubmitState() {
  const submit = document.getElementById('create-poll-submit');
  if (!submit) return;
  const titleInput = document.getElementById('poll-title');
  const titleFilled = Boolean(titleInput?.value?.trim());
  const choicesFilled = choiceInputs().every((el) => el.value.trim().length > 0);
  const running = lastSnapshot?.poll?.status === 'running';
  const scopeOk = Boolean(lastSnapshot?.auth?.isAuthenticated) && hasPollScope(lastSnapshot);
  const authenticated = Boolean(lastSnapshot?.auth?.isAuthenticated);

  const disabled =
    createPollInFlight ||
    running ||
    !authenticated ||
    !scopeOk ||
    !titleFilled ||
    !choicesFilled;

  submit.disabled = disabled;
}

async function onSubmitCreatePoll(event) {
  event.preventDefault();
  if (createPollInFlight) return;

  clearAllInlineErrors();

  const title = document.getElementById('poll-title').value.trim();
  const choices = choiceInputs().map((input) => input.value.trim());
  const duration = Number(document.getElementById('poll-duration').value);

  const submit = document.getElementById('create-poll-submit');
  createPollInFlight = true;
  const restore = setBusy(submit, 'Creating…');
  recomputeSubmitState();

  const result = await post('/api/twitch/create-poll', { title, choices, duration });

  createPollInFlight = false;
  restore();

  if (result.ok) {
    const body = result.payload || {};
    if (body.snapshot) {
      lastSnapshot = body.snapshot;
      renderAll(lastSnapshot);
    }
    // D14: clear form, keep focus on title.
    document.getElementById('poll-title').value = '';
    choiceInputs().forEach((input) => {
      input.value = '';
    });
    const titleInput = document.getElementById('poll-title');
    if (titleInput) titleInput.focus();
    recomputeSubmitState();
    return;
  }

  const err = result.payload?.error;
  const code = err?.code || 'upstream';
  const message = err?.message || 'Failed to create poll.';
  const hint = err?.hint;

  if (code === 'validation') {
    if (!showInlineError(hint, message)) {
      showGenericError(`<div class="banner error">${escapeHtml(message)}</div>`);
    }
    recomputeSubmitState();
    return;
  }

  if (code === 'insufficient_scope') {
    showGenericError(`
      <div class="banner error">
        Scope <code>channel:manage:polls</code> не выдан. <a href="/auth/login">Перелогиниться</a>.
      </div>
    `);
    recomputeSubmitState();
    return;
  }

  if (code === 'active_poll_exists') {
    // D13: refresh status, scroll to Current Poll, offer Recover Poll inline.
    pendingFormError = 'active_poll_exists';
    showGenericError(`
      <div class="banner error">
        На канале уже есть активный Poll.
        <div class="poll-conflict">
          <button type="button" id="inline-recover">Recover Poll</button>
        </div>
      </div>
    `);
    const inlineRecover = document.getElementById('inline-recover');
    if (inlineRecover) {
      inlineRecover.addEventListener('click', () => triggerRecover(inlineRecover));
    }
    await refreshStatus();
    const currentPollCard = document.getElementById('current-poll-card');
    if (currentPollCard && typeof currentPollCard.scrollIntoView === 'function') {
      currentPollCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    recomputeSubmitState();
    return;
  }

  if (code === 'broadcaster_ineligible') {
    showGenericError(`
      <div class="banner error">
        Twitch не разрешает создавать native Poll на этом канале.
        <strong>Helix POST /polls</strong> доступен только для Affiliate/Partner.
        Можно использовать <strong>Demo</strong> для UI-проверки или авторизоваться под Affiliate/Partner-каналом.
      </div>
    `);
    recomputeSubmitState();
    return;
  }

  // upstream / unknown
  showGenericError(`<div class="banner error">${escapeHtml(message)}</div>`);
  recomputeSubmitState();
}

// ---------- Action wiring ----------

async function simpleAction(path, button, busyText, body) {
  const restore = setBusy(button, busyText);
  const result = await post(path, body);
  restore();
  await refreshStatus();
  return result;
}

async function triggerRecover(button) {
  return simpleAction('/api/twitch/recover-latest-poll',
    button || document.getElementById('btn-recover'), 'Recovering…');
}

async function saveTargetChannel() {
  const input = document.getElementById('target-channel-login');
  const button = document.getElementById('target-channel-save');
  const error = document.getElementById('target-channel-error');
  if (!input || !button || targetChannelSaveInFlight) return;

  if (error) error.textContent = '';
  targetChannelSaveInFlight = true;
  const restore = setBusy(button, 'Saving…');
  const result = await post('/api/settings/target-channel', { login: input.value });
  targetChannelSaveInFlight = false;
  restore();

  if (result.ok) {
    const body = result.payload || {};
    if (body.snapshot) {
      lastSnapshot = body.snapshot;
      renderAll(lastSnapshot);
    }
    if (error) error.textContent = '';
    return;
  }

  if (error) {
    error.textContent = result.payload?.error?.message || 'Failed to save target channel.';
  }
}

function wireActions() {
  const wire = (id, path, busyText, body) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => simpleAction(path, btn, busyText, body));
  };

  wire('btn-demo-start', '/api/demo/start', 'Starting…');
  wire('btn-demo-3', '/api/demo/start', 'Starting…', {
    title: 'Demo: карта на следующий раунд?',
    choices: ['Dust II', 'Mirage', 'Inferno']
  });
  wire('btn-demo-stop', '/api/demo/stop', 'Stopping…');
  wire('btn-reconnect', '/api/twitch/reconnect', 'Reconnecting…');
  wire('btn-recover', '/api/twitch/recover-latest-poll', 'Recovering…');
  wire('btn-reset', '/api/reset', 'Resetting…');
  wire('twitch-logout', '/auth/logout', 'Logging out…');

  const targetSave = document.getElementById('target-channel-save');
  if (targetSave) targetSave.addEventListener('click', saveTargetChannel);
  const targetInput = document.getElementById('target-channel-login');
  if (targetInput) {
    targetInput.addEventListener('input', () => {
      const error = document.getElementById('target-channel-error');
      if (error) error.textContent = '';
    });
    targetInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      saveTargetChannel();
    });
  }
}

// ---------- Status polling ----------

async function refreshStatus() {
  try {
    const response = await fetch('/api/status');
    const payload = await response.json();
    lastSnapshot = payload.snapshot || null;
    renderAll(lastSnapshot);
    const pre = document.getElementById('status');
    if (pre) pre.textContent = JSON.stringify(lastSnapshot, null, 2);
  } catch (error) {
    const pre = document.getElementById('status');
    if (pre) pre.textContent = `Error loading status: ${error.message}`;
  }
}

function renderAll(snapshot) {
  renderScopeBanner(snapshot);
  renderLiveChannel(snapshot);
  renderCurrentPoll(snapshot);
  recomputeSubmitState();
}

// ---------- Init ----------

function init() {
  renderTokenBanner();

  // W3 widget cards.
  wireWidgetCard('widget-votes', 'scale', 'votes');
  wireWidgetCard('widget-bars', 'bars', 'votes');

  // W5 create poll form.
  populateDurations();
  for (let i = 0; i < MIN_CHOICES; i += 1) {
    const row = makeChoiceRow(i);
    document.getElementById('choices-list').appendChild(row);
  }
  rebuildChoiceRowLabels();

  document.getElementById('poll-title').addEventListener('input', () => {
    clearInlineError('title');
    recomputeSubmitState();
  });
  document.getElementById('poll-duration').addEventListener('change', () => {
    clearInlineError('duration');
    recomputeSubmitState();
  });
  document.getElementById('choice-add').addEventListener('click', addChoiceRow);
  document.getElementById('create-poll-form').addEventListener('submit', onSubmitCreatePoll);

  // W4 actions.
  wireActions();

  // Kick off polling loop + 1s countdown.
  refreshStatus();
  setInterval(refreshStatus, 3000);
  setInterval(updateCountdownTick, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
