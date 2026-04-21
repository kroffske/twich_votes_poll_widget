function pickWeightedIndex(length) {
  if (length <= 1) return 0;
  const roll = Math.random();
  if (roll < 0.48) return 0;
  if (roll < 0.88) return 1;
  return Math.floor(Math.random() * length);
}

export class DemoRunner {
  constructor({ state, logger }) {
    this.state = state;
    this.logger = logger;
    this.timer = null;
    this.poll = null;
  }

  start({ choices = ['Team Left', 'Team Right'], title = 'Demo vote: who wins?', durationSeconds = 300 } = {}) {
    this.stop();
    const started = new Date();
    const ends = new Date(started.getTime() + durationSeconds * 1000);

    this.poll = {
      id: `demo-${Date.now()}`,
      source: 'demo',
      title,
      status: 'ACTIVE',
      choices: choices.map((title, index) => ({
        id: `demo-choice-${index + 1}`,
        title,
        votes: index === 0 ? 12 : 10,
        channel_points_votes: index === 0 ? 2 : 3,
        bits_votes: 0
      })),
      channel_points_voting_enabled: true,
      channel_points_per_vote: 250,
      started_at: started.toISOString(),
      ends_at: ends.toISOString()
    };

    this.state.setPollFromEvent(this.poll, 'channel.poll.progress');
    this.timer = setInterval(() => this.tick(), 1100);
    this.logger.info('Demo poll started');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    if (!this.poll) return;
    const index = pickWeightedIndex(this.poll.choices.length);
    const choice = this.poll.choices[index];
    const extraVotes = Math.random() > 0.72 ? Math.ceil(Math.random() * 3) : 1;
    const usesPoints = Math.random() > 0.55;
    choice.votes += extraVotes;
    if (usesPoints) choice.channel_points_votes += extraVotes;
    this.state.setPollFromEvent(this.poll, 'channel.poll.progress');
  }
}
