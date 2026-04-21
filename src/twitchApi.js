import { refreshAccessToken } from './twitchAuth.js';
import { normalizePoll } from './state.js';

const HELIX_BASE = 'https://api.twitch.tv/helix';

const POLL_REQUIRED_SCOPE = 'channel:manage:polls';

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class CreatePollError extends Error {
  constructor(code, message, { hint, status, cause } = {}) {
    super(message);
    this.name = 'CreatePollError';
    this.code = code;
    this.hint = hint;
    this.status = status;
    if (cause) this.cause = cause;
  }
}

export async function ensureUserToken(config, authStore) {
  const auth = authStore.get();
  if (!auth?.accessToken) throw new Error('No Twitch user token. Open /auth/login first.');

  const shouldRefresh = !auth.expiresAt || auth.expiresAt - Date.now() < 60_000;
  if (!shouldRefresh) return auth;

  if (!auth.refreshToken) throw new Error('Twitch token is expiring and no refresh token is available. Re-login required.');
  const refreshed = await refreshAccessToken(config, auth.refreshToken);
  const next = {
    ...auth,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
    scopes: refreshed.scope || auth.scopes,
    savedAt: new Date().toISOString()
  };
  await authStore.save(next);
  return next;
}

export async function helix(config, authStore, endpoint, options = {}) {
  const auth = await ensureUserToken(config, authStore);
  const url = endpoint.startsWith('http') ? endpoint : `${HELIX_BASE}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    'Client-Id': config.twitch.clientId,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Twitch Helix ${options.method || 'GET'} ${endpoint} failed: HTTP ${response.status} ${text}`);
    err.status = response.status;
    err.body = text;
    err.bodyJson = tryParseJson(text);
    throw err;
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function createEventSubSubscription(config, authStore, { type, version = '1', condition, sessionId }) {
  return helix(config, authStore, '/eventsub/subscriptions', {
    method: 'POST',
    body: {
      type,
      version,
      condition,
      transport: {
        method: 'websocket',
        session_id: sessionId
      }
    }
  });
}

export async function getLatestPoll(config, authStore) {
  const auth = await ensureUserToken(config, authStore);
  const params = new URLSearchParams({ broadcaster_id: auth.userId, first: '1' });
  const payload = await helix(config, authStore, `/polls?${params.toString()}`);
  return payload.data?.[0] || null;
}

export function validateCreatePollInput(payload) {
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  if (!title) {
    throw new CreatePollError('validation', 'Title is required.', { hint: 'title', status: 400 });
  }
  if (title.length > 60) {
    throw new CreatePollError('validation', 'Title must be ≤ 60 characters.', { hint: 'title', status: 400 });
  }

  if (!Array.isArray(payload?.choices)) {
    throw new CreatePollError('validation', 'Choices must be an array.', { hint: 'choices', status: 400 });
  }
  if (payload.choices.length < 2 || payload.choices.length > 5) {
    throw new CreatePollError('validation', 'Poll needs between 2 and 5 choices.', { hint: 'choices', status: 400 });
  }

  const trimmedChoices = [];
  const seen = new Map();
  for (let i = 0; i < payload.choices.length; i += 1) {
    const raw = payload.choices[i];
    if (typeof raw !== 'string') {
      throw new CreatePollError('validation', `Choice ${i + 1} must be a string.`, { hint: `choices[${i}]`, status: 400 });
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new CreatePollError('validation', `Choice ${i + 1} is empty.`, { hint: `choices[${i}]`, status: 400 });
    }
    if (trimmed.length > 25) {
      throw new CreatePollError('validation', `Choice ${i + 1} must be ≤ 25 characters.`, { hint: `choices[${i}]`, status: 400 });
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      throw new CreatePollError('validation', `Choice ${i + 1} duplicates choice ${seen.get(key) + 1}.`, { hint: `choices[${i}]`, status: 400 });
    }
    seen.set(key, i);
    trimmedChoices.push(trimmed);
  }

  const duration = payload?.duration;
  if (!Number.isInteger(duration)) {
    throw new CreatePollError('validation', 'Duration must be an integer number of seconds.', { hint: 'duration', status: 400 });
  }
  if (duration < 15 || duration > 1800) {
    throw new CreatePollError('validation', 'Duration must be between 15 and 1800 seconds.', { hint: 'duration', status: 400 });
  }

  return { title, choices: trimmedChoices, duration };
}

function isInsufficientScopeError(err) {
  if (err?.status !== 401) return false;
  const text = String(err?.body || '').toLowerCase();
  if (text.includes('scope')) return true;
  const msg = String(err?.bodyJson?.message || '').toLowerCase();
  return msg.includes('scope') || msg.includes('missing scope');
}

function isActivePollConflict(err) {
  if (err?.status !== 400 && err?.status !== 409) return false;
  const text = String(err?.bodyJson?.message || err?.body || '').toLowerCase();
  return text.includes('active poll') || text.includes('already');
}

function isBroadcasterIneligibleError(err) {
  if (err?.status !== 403) return false;
  const text = String(err?.bodyJson?.message || err?.body || '').toLowerCase();
  return (
    text.includes('not a partner or affiliate') ||
    (text.includes('permissiondenied') && text.includes('affiliate')) ||
    (text.includes('permissiondenied') && text.includes('partner'))
  );
}

export async function createPoll(config, authStore, rawPayload) {
  const input = validateCreatePollInput(rawPayload);
  const auth = await ensureUserToken(config, authStore);

  const scopes = Array.isArray(auth?.scopes) ? auth.scopes : [];
  if (!scopes.includes(POLL_REQUIRED_SCOPE)) {
    throw new CreatePollError('insufficient_scope', `Missing Twitch scope: ${POLL_REQUIRED_SCOPE}.`, {
      hint: 'Re-login to grant channel:manage:polls scope.',
      status: 401
    });
  }

  // Cheap active-poll precheck so we return a clean 409 before hitting POST /polls.
  try {
    const latest = await getLatestPoll(config, authStore);
    if (latest?.status === 'ACTIVE') {
      throw new CreatePollError('active_poll_exists', 'An active poll already exists on this channel.', {
        hint: 'Recover or end the current poll first.',
        status: 409
      });
    }
  } catch (error) {
    if (error instanceof CreatePollError) throw error;
    if (isInsufficientScopeError(error)) {
      throw new CreatePollError('insufficient_scope', `Missing Twitch scope: ${POLL_REQUIRED_SCOPE}.`, {
        hint: 'Re-login to grant channel:manage:polls scope.',
        status: 401,
        cause: error
      });
    }
    // Unexpected failure during precheck — surface as upstream.
    throw new CreatePollError('upstream', error.message || 'Failed to check current poll status.', {
      status: 502,
      cause: error
    });
  }

  let helixResponse;
  try {
    helixResponse = await helix(config, authStore, '/polls', {
      method: 'POST',
      body: {
        broadcaster_id: auth.userId,
        title: input.title,
        choices: input.choices.map((title) => ({ title })),
        duration: input.duration,
        channel_points_voting_enabled: false,
        channel_points_per_vote: 0
      }
    });
  } catch (error) {
    if (isInsufficientScopeError(error)) {
      throw new CreatePollError('insufficient_scope', `Missing Twitch scope: ${POLL_REQUIRED_SCOPE}.`, {
        hint: 'Re-login to grant channel:manage:polls scope.',
        status: 401,
        cause: error
      });
    }
    if (isBroadcasterIneligibleError(error)) {
      throw new CreatePollError(
        'broadcaster_ineligible',
        'Twitch denied native poll creation for this channel.',
        {
          hint: 'Helix POST /polls is only available for Affiliate or Partner channels.',
          status: 403,
          cause: error
        }
      );
    }
    if (isActivePollConflict(error)) {
      throw new CreatePollError('active_poll_exists', 'An active poll already exists on this channel.', {
        hint: 'Recover or end the current poll first.',
        status: 409,
        cause: error
      });
    }
    throw new CreatePollError('upstream', error.message || 'Twitch create-poll failed.', {
      status: 502,
      cause: error
    });
  }

  const raw = helixResponse?.data?.[0];
  if (!raw) {
    throw new CreatePollError('upstream', 'Twitch did not return a poll payload.', { status: 502 });
  }
  return normalizePoll(raw, 'helix.poll');
}
