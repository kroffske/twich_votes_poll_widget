import test from 'node:test';
import assert from 'node:assert/strict';
import { OverlayState, normalizePoll } from '../src/state.js';

test('normalizePoll calculates Channel Points spent from poll votes', () => {
  const poll = normalizePoll({
    id: 'p1',
    title: 'Test',
    choices: [
      { id: 'a', title: 'A', votes: 10, channel_points_votes: 2, bits_votes: 0 },
      { id: 'b', title: 'B', votes: 20, channel_points_votes: 3, bits_votes: 0 }
    ],
    channel_points_voting: { is_enabled: true, amount_per_vote: 250 },
    started_at: '2026-04-19T12:00:00Z',
    ends_at: '2026-04-19T12:05:00Z'
  }, 'channel.poll.progress');

  assert.equal(poll.totals.votes, 30);
  assert.equal(poll.totals.channelPointsVotes, 5);
  assert.equal(poll.totals.pointsSpent, 1250);
  assert.equal(poll.status, 'running');
});

test('custom reward redemption creates a synthetic points battle when reward is mapped', () => {
  const state = new OverlayState({
    rewardChoiceMap: { left: 'Left', right: 'Right' },
    rewardsTitle: 'Battle'
  });

  state.applyRewardRedemption({
    id: 'r1',
    user_name: 'Viewer',
    reward: { id: 'left', title: 'Left reward', cost: 500 },
    redeemed_at: '2026-04-19T12:00:00Z'
  });

  const snapshot = state.getSnapshot();
  assert.equal(snapshot.poll.title, 'Battle');
  assert.equal(snapshot.poll.source, 'custom-rewards');
  assert.equal(snapshot.poll.totals.pointsSpent, 500);
  assert.equal(snapshot.poll.choices.find((choice) => choice.title === 'Left').votes, 1);
});
