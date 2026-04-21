import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTargetChannelLogin } from '../src/targetChannel.js';
import { OverlayState } from '../src/state.js';

test('normalizeTargetChannelLogin strips @ and lowercases the login', () => {
  assert.equal(normalizeTargetChannelLogin('  @Wololo_Bot  '), 'wololo_bot');
});

test('normalizeTargetChannelLogin allows empty values for clearing the setting', () => {
  assert.equal(normalizeTargetChannelLogin('   '), '');
});

test('normalizeTargetChannelLogin rejects unsupported characters', () => {
  assert.throws(
    () => normalizeTargetChannelLogin('bad-channel!'),
    /letters, numbers, or underscores/i
  );
});

test('OverlayState stores project target channel separately from auth', () => {
  const state = new OverlayState();
  state.setAuth({
    accessToken: 'token',
    userId: '1',
    userLogin: 'authorized_channel',
    userName: 'Authorized Channel',
    scopes: []
  });
  state.setTargetChannel({ login: 'project_target', source: 'saved' });

  const snapshot = state.getSnapshot();
  assert.equal(snapshot.auth.userLogin, 'authorized_channel');
  assert.equal(snapshot.targetChannel.login, 'project_target');
  assert.equal(snapshot.targetChannel.source, 'saved');
});
