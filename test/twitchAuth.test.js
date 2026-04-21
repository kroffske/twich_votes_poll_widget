import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoginUrl, parseTokenScopes } from '../src/twitchAuth.js';

const BASE_CONFIG = {
  twitch: {
    clientId: 'test-client-id',
    redirectUri: 'http://localhost:3030/auth/callback',
    scopes: ['channel:read:polls', 'channel:manage:polls']
  }
};

test('buildLoginUrl sets force_verify=true to avoid silent scope reuse', () => {
  const url = new URL(buildLoginUrl(BASE_CONFIG, 'state-token-abc'));
  assert.equal(url.searchParams.get('force_verify'), 'true');
  assert.equal(url.searchParams.get('client_id'), 'test-client-id');
  assert.equal(url.searchParams.get('state'), 'state-token-abc');
  assert.equal(
    url.searchParams.get('scope'),
    'channel:read:polls channel:manage:polls'
  );
});

test('parseTokenScopes accepts array, string, or missing', () => {
  const requested = ['channel:read:polls'];
  assert.deepEqual(
    parseTokenScopes(['channel:read:polls', 'channel:manage:polls'], requested),
    ['channel:read:polls', 'channel:manage:polls']
  );
  assert.deepEqual(
    parseTokenScopes('channel:read:polls channel:manage:polls', requested),
    ['channel:read:polls', 'channel:manage:polls']
  );
  assert.deepEqual(parseTokenScopes(undefined, requested), requested);
  assert.deepEqual(parseTokenScopes('', requested), requested);
});
