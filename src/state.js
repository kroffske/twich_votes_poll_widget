import { EventEmitter } from 'node:events';

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isoNow() {
  return new Date().toISOString();
}

function twitchPollStatus(rawStatus, eventType) {
  const status = String(rawStatus || '').toUpperCase();
  if (eventType === 'channel.poll.end') return 'ended';
  if (status === 'ACTIVE') return 'running';
  if (['COMPLETED', 'TERMINATED', 'ARCHIVED', 'MODERATED'].includes(status)) return 'ended';
  if (eventType === 'channel.poll.begin' || eventType === 'channel.poll.progress') return 'running';
  return status ? status.toLowerCase() : 'running';
}

function channelPointsConfig(raw) {
  const eventConfig = raw.channel_points_voting || {};
  return {
    enabled: Boolean(eventConfig.is_enabled ?? raw.channel_points_voting_enabled ?? false),
    amountPerVote: n(eventConfig.amount_per_vote ?? raw.channel_points_per_vote, 0)
  };
}

export function normalizePoll(raw, eventType = 'helix.poll') {
  const cp = channelPointsConfig(raw);
  const choices = (raw.choices || []).map((choice) => {
    const channelPointsVotes = n(choice.channel_points_votes, 0);
    const pointsSpent = n(choice.points_spent, channelPointsVotes * cp.amountPerVote);
    return {
      id: String(choice.id),
      title: String(choice.title || 'Untitled'),
      votes: n(choice.votes, 0),
      channelPointsVotes,
      bitsVotes: n(choice.bits_votes, 0),
      pointsSpent
    };
  });

  const totalVotes = choices.reduce((sum, choice) => sum + choice.votes, 0);
  const totalChannelPointsVotes = choices.reduce((sum, choice) => sum + choice.channelPointsVotes, 0);
  const totalPointsSpent = choices.reduce((sum, choice) => sum + choice.pointsSpent, 0);

  return {
    id: String(raw.id || `poll-${Date.now()}`),
    source: raw.source || 'twitch-poll',
    title: String(raw.title || 'Twitch Poll'),
    status: twitchPollStatus(raw.status, eventType),
    choices,
    totals: {
      votes: totalVotes,
      channelPointsVotes: totalChannelPointsVotes,
      pointsSpent: totalPointsSpent
    },
    channelPointsVoting: cp,
    startedAt: raw.started_at || raw.startedAt || null,
    endsAt: raw.ends_at || raw.endsAt || null,
    endedAt: raw.ended_at || raw.endedAt || null,
    updatedAt: isoNow(),
    eventType
  };
}

function createEmptySnapshot() {
  return {
    version: 1,
    updatedAt: isoNow(),
    auth: {
      isAuthenticated: false,
      userId: null,
      userLogin: null,
      userName: null,
      scopes: []
    },
    connection: {
      twitch: 'disconnected',
      sessionId: null,
      lastEventAt: null,
      lastKeepaliveAt: null,
      lastError: null,
      subscriptions: []
    },
    targetChannel: {
      login: null,
      source: null
    },
    poll: null,
    recentRedemptions: []
  };
}

export class OverlayState extends EventEmitter {
  constructor({ rewardChoiceMap = {}, rewardsTitle = 'Channel Points Battle' } = {}) {
    super();
    this.rewardChoiceMap = rewardChoiceMap;
    this.rewardsTitle = rewardsTitle;
    this.snapshot = createEmptySnapshot();
  }

  getSnapshot() {
    return structuredClone(this.snapshot);
  }

  emitChanged() {
    this.snapshot.updatedAt = isoNow();
    this.emit('changed', this.getSnapshot());
  }

  setAuth(auth) {
    this.snapshot.auth = {
      isAuthenticated: Boolean(auth?.accessToken),
      userId: auth?.userId || null,
      userLogin: auth?.userLogin || null,
      userName: auth?.userName || null,
      scopes: auth?.scopes || []
    };
    this.emitChanged();
  }

  setConnection(patch) {
    this.snapshot.connection = {
      ...this.snapshot.connection,
      ...patch
    };
    this.emitChanged();
  }

  setTargetChannel(target) {
    const login = typeof target === 'string' ? target : target?.login || '';
    const source = login ? (typeof target === 'string' ? 'saved' : target?.source || 'saved') : null;
    this.snapshot.targetChannel = {
      login: login || null,
      source
    };
    this.emitChanged();
  }

  setPollFromEvent(event, eventType) {
    this.snapshot.poll = normalizePoll(event, eventType);
    this.snapshot.connection.lastEventAt = isoNow();
    this.emitChanged();
  }

  setPollFromHelix(poll) {
    if (!poll) return;
    this.snapshot.poll = normalizePoll(poll, 'helix.poll');
    this.emitChanged();
  }

  resetPoll() {
    this.snapshot.poll = null;
    this.emitChanged();
  }

  applyRewardRedemption(event) {
    const rewardId = String(event.reward?.id || 'unknown-reward');
    const mappedTitle = this.rewardChoiceMap[rewardId];
    const rewardTitle = mappedTitle || event.reward?.title || 'Reward';
    const cost = n(event.reward?.cost, 0);

    this.snapshot.recentRedemptions.unshift({
      id: event.id,
      userName: event.user_name || event.user_login || 'viewer',
      rewardId,
      rewardTitle,
      mappedTitle: mappedTitle || null,
      cost,
      redeemedAt: event.redeemed_at || isoNow()
    });
    this.snapshot.recentRedemptions = this.snapshot.recentRedemptions.slice(0, 10);

    if (!mappedTitle) {
      this.emitChanged();
      return;
    }

    const existing = this.snapshot.poll;
    const isRewardPoll = existing?.source === 'custom-rewards';
    const allMappedChoices = [...new Set(Object.values(this.rewardChoiceMap).map(String))];
    const baseChoices = allMappedChoices.map((title, index) => ({
      id: `reward-choice-${index + 1}-${title}`,
      title,
      votes: 0,
      channelPointsVotes: 0,
      bitsVotes: 0,
      pointsSpent: 0
    }));

    const poll = isRewardPoll ? structuredClone(existing) : {
      id: `custom-rewards-${this.snapshot.auth.userId || 'channel'}`,
      source: 'custom-rewards',
      title: this.rewardsTitle,
      status: 'running',
      choices: baseChoices,
      totals: { votes: 0, channelPointsVotes: 0, pointsSpent: 0 },
      channelPointsVoting: { enabled: true, amountPerVote: 1 },
      startedAt: isoNow(),
      endsAt: null,
      endedAt: null,
      updatedAt: isoNow(),
      eventType: 'channel.channel_points_custom_reward_redemption.add'
    };

    let choice = poll.choices.find((item) => item.title === mappedTitle);
    if (!choice) {
      choice = {
        id: `reward-choice-${poll.choices.length + 1}-${mappedTitle}`,
        title: mappedTitle,
        votes: 0,
        channelPointsVotes: 0,
        bitsVotes: 0,
        pointsSpent: 0
      };
      poll.choices.push(choice);
    }

    choice.votes += 1;
    choice.channelPointsVotes += 1;
    choice.pointsSpent += cost;

    poll.totals = {
      votes: poll.choices.reduce((sum, item) => sum + item.votes, 0),
      channelPointsVotes: poll.choices.reduce((sum, item) => sum + item.channelPointsVotes, 0),
      pointsSpent: poll.choices.reduce((sum, item) => sum + item.pointsSpent, 0)
    };
    poll.updatedAt = isoNow();

    this.snapshot.poll = poll;
    this.snapshot.connection.lastEventAt = isoNow();
    this.emitChanged();
  }
}
