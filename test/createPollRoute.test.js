import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createPollRouteHandler } from '../src/createPollRoute.js';
import { OverlayState } from '../src/state.js';

const BASE_CONFIG = { twitch: { clientId: 'client-id-test' } };

function makeAuthStore(auth) {
  return {
    get: () => auth,
    save: async (next) => {
      Object.assign(auth, next);
      return auth;
    }
  };
}

function validAuth(overrides = {}) {
  return {
    accessToken: 'token-abc',
    refreshToken: 'refresh-abc',
    expiresAt: Date.now() + 60 * 60 * 1000,
    userId: 'user-42',
    userLogin: 'wololo',
    userName: 'Wololo',
    scopes: ['channel:read:polls', 'channel:manage:polls'],
    ...overrides
  };
}

function queueFetchResponses(responses) {
  const calls = [];
  const queue = [...responses];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    // Pass through non-Helix calls (e.g. the test client hitting the local express app).
    if (!urlStr.startsWith('https://api.twitch.tv/')) {
      return original(url, init);
    }
    calls.push({ url: urlStr, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    if (!queue.length) throw new Error(`Unexpected Helix fetch to ${urlStr}`);
    const next = queue.shift();
    const status = next.status ?? 200;
    const bodyText = typeof next.body === 'string' ? next.body : JSON.stringify(next.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (typeof next.body === 'string' ? JSON.parse(next.body) : next.body),
      text: async () => bodyText
    };
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    }
  };
}

async function startApp({ authStore, state }) {
  const app = express();
  app.use(express.json());
  app.post(
    '/api/twitch/create-poll',
    createPollRouteHandler({
      config: BASE_CONFIG,
      authStore,
      state,
      logger: { info() {}, warn() {}, error() {} }
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json, text };
}

test('route returns 400 validation with hint when title is empty', async () => {
  const authStore = makeAuthStore(validAuth());
  const state = new OverlayState();
  const app = await startApp({ authStore, state });
  const mock = queueFetchResponses([]); // no upstream calls expected

  try {
    const res = await postJson(`${app.url}/api/twitch/create-poll`, { title: '', choices: ['a', 'b'], duration: 30 });
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, 'validation');
    assert.equal(res.json.error.hint, 'title');
    assert.equal(state.getSnapshot().poll, null);
    assert.equal(mock.calls.length, 0);
  } finally {
    await app.close();
    mock.restore();
  }
});

test('route returns 401 insufficient_scope when auth scopes lack channel:manage:polls', async () => {
  const authStore = makeAuthStore(validAuth({ scopes: ['channel:read:polls'] }));
  const state = new OverlayState();
  const app = await startApp({ authStore, state });
  const mock = queueFetchResponses([]);

  try {
    const res = await postJson(`${app.url}/api/twitch/create-poll`, { title: 'T', choices: ['a', 'b'], duration: 30 });
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'insufficient_scope');
    assert.ok(String(res.json.error.hint).includes('channel:manage:polls'));
    assert.equal(mock.calls.length, 0);
  } finally {
    await app.close();
    mock.restore();
  }
});

test('route returns 409 active_poll_exists when a poll is already ACTIVE', async () => {
  const authStore = makeAuthStore(validAuth());
  const state = new OverlayState();
  const app = await startApp({ authStore, state });
  const mock = queueFetchResponses([
    { status: 200, body: { data: [{ id: 'p-live', status: 'ACTIVE', title: 'Live', choices: [] }] } }
  ]);

  try {
    const res = await postJson(`${app.url}/api/twitch/create-poll`, { title: 'T', choices: ['a', 'b'], duration: 30 });
    assert.equal(res.status, 409);
    assert.equal(res.json.error.code, 'active_poll_exists');
    assert.match(res.json.error.hint, /Recover or end/i);
  } finally {
    await app.close();
    mock.restore();
  }
});

test('route returns 403 broadcaster_ineligible when Helix says channel is not affiliate/partner', async () => {
  const authStore = makeAuthStore(validAuth());
  const state = new OverlayState();
  const app = await startApp({ authStore, state });
  const mock = queueFetchResponses([
    { status: 200, body: { data: [] } },
    {
      status: 403,
      body: {
        error: 'Forbidden',
        status: 403,
        message: 'Error.PermissionDenied: ownedBy 1467492471 is not a partner or affiliate'
      }
    }
  ]);

  try {
    const res = await postJson(`${app.url}/api/twitch/create-poll`, { title: 'T', choices: ['a', 'b'], duration: 30 });
    assert.equal(res.status, 403);
    assert.equal(res.json.error.code, 'broadcaster_ineligible');
    assert.match(res.json.error.hint, /Affiliate or Partner/i);
  } finally {
    await app.close();
    mock.restore();
  }
});

test('route returns 502 upstream on Helix 500', async () => {
  const authStore = makeAuthStore(validAuth());
  const state = new OverlayState();
  const app = await startApp({ authStore, state });
  const mock = queueFetchResponses([
    { status: 200, body: { data: [] } },
    { status: 500, body: { error: 'Internal Server Error', status: 500, message: 'boom' } }
  ]);

  try {
    const res = await postJson(`${app.url}/api/twitch/create-poll`, { title: 'T', choices: ['a', 'b'], duration: 30 });
    assert.equal(res.status, 502);
    assert.equal(res.json.error.code, 'upstream');
  } finally {
    await app.close();
    mock.restore();
  }
});

test('route success returns 201 with poll + snapshot and updates overlay state', async () => {
  const authStore = makeAuthStore(validAuth());
  const state = new OverlayState();
  let changedCount = 0;
  state.on('changed', () => { changedCount += 1; });

  const app = await startApp({ authStore, state });

  const helixPoll = {
    id: 'poll-xyz',
    title: 'New poll',
    status: 'ACTIVE',
    choices: [
      { id: 'c1', title: 'Dust II', votes: 0, channel_points_votes: 0, bits_votes: 0 },
      { id: 'c2', title: 'Mirage', votes: 0, channel_points_votes: 0, bits_votes: 0 }
    ],
    channel_points_voting: { is_enabled: false, amount_per_vote: 0 },
    started_at: '2026-04-21T12:00:00Z',
    ends_at: '2026-04-21T12:05:00Z'
  };

  const mock = queueFetchResponses([
    { status: 200, body: { data: [] } },               // precheck: no active
    { status: 200, body: { data: [helixPoll] } }       // POST /polls success
  ]);

  try {
    const before = state.getSnapshot();
    assert.equal(before.poll, null);
    assert.equal(before.connection.lastEventAt, null);

    const res = await postJson(`${app.url}/api/twitch/create-poll`, {
      title: 'New poll',
      choices: ['Dust II', 'Mirage'],
      duration: 300
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.poll.id, 'poll-xyz');
    assert.equal(res.json.poll.status, 'running');
    assert.equal(res.json.snapshot.poll.id, 'poll-xyz');

    const after = state.getSnapshot();
    assert.equal(after.poll.id, 'poll-xyz');
    assert.ok(after.connection.lastEventAt, 'lastEventAt should be set on create');
    assert.ok(changedCount >= 1, 'state should have emitted changed at least once');
  } finally {
    await app.close();
    mock.restore();
  }
});
