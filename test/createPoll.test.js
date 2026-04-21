import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCreatePollInput,
  createPoll,
  CreatePollError
} from '../src/twitchApi.js';

const BASE_CONFIG = {
  twitch: { clientId: 'client-id-test' }
};

function makeAuthStore(auth) {
  return {
    get: () => auth,
    save: async (next) => {
      Object.assign(auth, next);
      return auth;
    }
  };
}

function queueFetchResponses(responses) {
  const calls = [];
  const queue = [...responses];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers || {} });
    if (!queue.length) {
      throw new Error(`Unexpected fetch to ${url}`);
    }
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

test('validateCreatePollInput rejects empty title with hint="title"', () => {
  assert.throws(
    () => validateCreatePollInput({ title: '   ', choices: ['a', 'b'], duration: 30 }),
    (err) => err instanceof CreatePollError && err.code === 'validation' && err.hint === 'title'
  );
});

test('validateCreatePollInput rejects title longer than 60 chars', () => {
  const longTitle = 'x'.repeat(61);
  assert.throws(
    () => validateCreatePollInput({ title: longTitle, choices: ['a', 'b'], duration: 30 }),
    (err) => err.code === 'validation' && err.hint === 'title'
  );
});

test('validateCreatePollInput rejects non-array choices with hint="choices"', () => {
  assert.throws(
    () => validateCreatePollInput({ title: 'T', choices: 'nope', duration: 30 }),
    (err) => err.code === 'validation' && err.hint === 'choices'
  );
});

test('validateCreatePollInput rejects fewer than 2 choices', () => {
  assert.throws(
    () => validateCreatePollInput({ title: 'T', choices: ['only-one'], duration: 30 }),
    (err) => err.code === 'validation' && err.hint === 'choices'
  );
});

test('validateCreatePollInput rejects more than 5 choices', () => {
  assert.throws(
    () => validateCreatePollInput({ title: 'T', choices: ['a', 'b', 'c', 'd', 'e', 'f'], duration: 30 }),
    (err) => err.code === 'validation' && err.hint === 'choices'
  );
});

test('validateCreatePollInput rejects empty trimmed choice with indexed hint', () => {
  assert.throws(
    () => validateCreatePollInput({ title: 'T', choices: ['a', '   '], duration: 30 }),
    (err) => err.code === 'validation' && err.hint === 'choices[1]'
  );
});

test('validateCreatePollInput rejects choice longer than 25 chars with indexed hint', () => {
  const long = 'y'.repeat(26);
  assert.throws(
    () => validateCreatePollInput({ title: 'T', choices: ['a', long, 'c'], duration: 30 }),
    (err) => err.code === 'validation' && err.hint === 'choices[1]'
  );
});

test('validateCreatePollInput rejects duplicate choices after trim+lowercase', () => {
  assert.throws(
    () => validateCreatePollInput({ title: 'T', choices: ['Dust II', 'Mirage', ' dust ii '], duration: 30 }),
    (err) => err.code === 'validation' && err.hint === 'choices[2]'
  );
});

test('validateCreatePollInput rejects non-integer duration', () => {
  assert.throws(
    () => validateCreatePollInput({ title: 'T', choices: ['a', 'b'], duration: 30.5 }),
    (err) => err.code === 'validation' && err.hint === 'duration'
  );
});

test('validateCreatePollInput rejects duration below 15', () => {
  assert.throws(
    () => validateCreatePollInput({ title: 'T', choices: ['a', 'b'], duration: 14 }),
    (err) => err.code === 'validation' && err.hint === 'duration'
  );
});

test('validateCreatePollInput rejects duration above 1800', () => {
  assert.throws(
    () => validateCreatePollInput({ title: 'T', choices: ['a', 'b'], duration: 1801 }),
    (err) => err.code === 'validation' && err.hint === 'duration'
  );
});

test('validateCreatePollInput returns trimmed title + choices on success', () => {
  const out = validateCreatePollInput({
    title: '  Куда идем?  ',
    choices: ['  Dust II  ', 'Mirage'],
    duration: 60
  });
  assert.deepEqual(out, { title: 'Куда идем?', choices: ['Dust II', 'Mirage'], duration: 60 });
});

test('createPoll returns insufficient_scope when auth.scopes lacks channel:manage:polls', async () => {
  const authStore = makeAuthStore(validAuth({ scopes: ['channel:read:polls'] }));
  const mock = queueFetchResponses([]); // no fetches expected
  try {
    await assert.rejects(
      () => createPoll(BASE_CONFIG, authStore, { title: 'T', choices: ['a', 'b'], duration: 30 }),
      (err) => err instanceof CreatePollError && err.code === 'insufficient_scope' && err.status === 401
    );
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test('createPoll returns active_poll_exists when latest poll status is ACTIVE', async () => {
  const authStore = makeAuthStore(validAuth());
  const mock = queueFetchResponses([
    // getLatestPoll response
    { status: 200, body: { data: [{ id: 'p-1', status: 'ACTIVE', title: 'Old', choices: [] }] } }
  ]);
  try {
    await assert.rejects(
      () => createPoll(BASE_CONFIG, authStore, { title: 'T', choices: ['a', 'b'], duration: 30 }),
      (err) => err instanceof CreatePollError && err.code === 'active_poll_exists' && err.status === 409
    );
    assert.equal(mock.calls.length, 1);
    assert.match(mock.calls[0].url, /\/polls\?broadcaster_id=user-42/);
  } finally {
    mock.restore();
  }
});

test('createPoll maps Helix 401 scope error to insufficient_scope', async () => {
  const authStore = makeAuthStore(validAuth());
  const mock = queueFetchResponses([
    // getLatestPoll: OK, no active poll
    { status: 200, body: { data: [{ id: 'p-old', status: 'COMPLETED', title: 'Old', choices: [] }] } },
    // POST /polls: 401 missing scope
    { status: 401, body: { error: 'Unauthorized', status: 401, message: 'Missing scope: channel:manage:polls' } }
  ]);
  try {
    await assert.rejects(
      () => createPoll(BASE_CONFIG, authStore, { title: 'T', choices: ['a', 'b'], duration: 30 }),
      (err) => err instanceof CreatePollError && err.code === 'insufficient_scope' && err.status === 401
    );
  } finally {
    mock.restore();
  }
});

test('createPoll maps Helix 400 "active poll" message to active_poll_exists', async () => {
  const authStore = makeAuthStore(validAuth());
  const mock = queueFetchResponses([
    // getLatestPoll: no active
    { status: 200, body: { data: [] } },
    // POST /polls: 400 active poll already exists (race condition)
    { status: 400, body: { error: 'Bad Request', status: 400, message: 'There is already an active poll.' } }
  ]);
  try {
    await assert.rejects(
      () => createPoll(BASE_CONFIG, authStore, { title: 'T', choices: ['a', 'b'], duration: 30 }),
      (err) => err instanceof CreatePollError && err.code === 'active_poll_exists' && err.status === 409
    );
  } finally {
    mock.restore();
  }
});

test('createPoll maps Helix 403 non-affiliate channel to broadcaster_ineligible', async () => {
  const authStore = makeAuthStore(validAuth());
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
    await assert.rejects(
      () => createPoll(BASE_CONFIG, authStore, { title: 'T', choices: ['a', 'b'], duration: 30 }),
      (err) => (
        err instanceof CreatePollError &&
        err.code === 'broadcaster_ineligible' &&
        err.status === 403 &&
        String(err.hint).includes('Affiliate or Partner')
      )
    );
  } finally {
    mock.restore();
  }
});

test('createPoll maps unexpected Helix 500 to upstream with 502', async () => {
  const authStore = makeAuthStore(validAuth());
  const mock = queueFetchResponses([
    { status: 200, body: { data: [] } },
    { status: 500, body: { error: 'Internal Server Error', status: 500, message: 'boom' } }
  ]);
  try {
    await assert.rejects(
      () => createPoll(BASE_CONFIG, authStore, { title: 'T', choices: ['a', 'b'], duration: 30 }),
      (err) => err instanceof CreatePollError && err.code === 'upstream' && err.status === 502
    );
  } finally {
    mock.restore();
  }
});

test('createPoll happy path returns normalized poll shape', async () => {
  const authStore = makeAuthStore(validAuth());
  const helixPoll = {
    id: 'poll-xyz',
    title: 'Куда идем дальше?',
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
    // getLatestPoll precheck: no active poll
    { status: 200, body: { data: [] } },
    // POST /polls
    { status: 200, body: { data: [helixPoll] } }
  ]);
  try {
    const result = await createPoll(BASE_CONFIG, authStore, {
      title: '  Куда идем дальше?  ',
      choices: [' Dust II ', 'Mirage'],
      duration: 300
    });
    assert.equal(result.id, 'poll-xyz');
    assert.equal(result.title, 'Куда идем дальше?');
    assert.equal(result.status, 'running');
    assert.equal(result.choices.length, 2);
    assert.equal(result.choices[0].title, 'Dust II');
    assert.equal(result.eventType, 'helix.poll');
    assert.equal(result.endsAt, '2026-04-21T12:05:00Z');

    // Ensure POST body was shaped correctly.
    const postCall = mock.calls[1];
    assert.equal(postCall.method, 'POST');
    assert.match(postCall.url, /\/polls$/);
    assert.deepEqual(postCall.body, {
      broadcaster_id: 'user-42',
      title: 'Куда идем дальше?',
      choices: [{ title: 'Dust II' }, { title: 'Mirage' }],
      duration: 300,
      channel_points_voting_enabled: false,
      channel_points_per_vote: 0
    });
  } finally {
    mock.restore();
  }
});
