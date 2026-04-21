import WebSocket from 'ws';
import { createEventSubSubscription, ensureUserToken } from './twitchApi.js';

const POLL_TYPES = [
  'channel.poll.begin',
  'channel.poll.progress',
  'channel.poll.end'
];

export class EventSubClient {
  constructor({ config, authStore, state, logger }) {
    this.config = config;
    this.authStore = authStore;
    this.state = state;
    this.logger = logger;
    this.socket = null;
    this.isStopping = false;
    this.reconnectTimer = null;
    this.lastSessionId = null;
  }

  async start() {
    const auth = this.authStore.get();
    if (!auth?.accessToken) {
      this.logger.warn('Twitch auth not found. Open /auth/login first.');
      return;
    }
    this.isStopping = false;
    await this.connect(this.config.twitch.eventSubWsUrl, false);
  }

  stop() {
    this.isStopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) this.socket.close();
    this.socket = null;
    this.state.setConnection({ twitch: 'disconnected', sessionId: null });
  }

  async connect(url, isReconnect) {
    this.state.setConnection({ twitch: 'connecting', lastError: null });
    this.logger.info(`Connecting to Twitch EventSub WebSocket${isReconnect ? ' via reconnect_url' : ''}`);

    const nextSocket = new WebSocket(url);
    let promoted = false;

    nextSocket.on('open', () => {
      this.logger.info('Twitch EventSub socket opened');
    });

    nextSocket.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const messageType = message.metadata?.message_type;

        if (messageType === 'session_welcome') {
          const session = message.payload?.session;
          const sessionId = session?.id;
          promoted = true;

          const previous = this.socket;
          this.socket = nextSocket;
          this.lastSessionId = sessionId;
          this.state.setConnection({ twitch: 'connected', sessionId, lastKeepaliveAt: null });

          if (previous && previous !== nextSocket) previous.close();

          if (!isReconnect) {
            await this.subscribe(sessionId);
          } else {
            this.state.setConnection({ twitch: 'subscribed', sessionId });
          }
          return;
        }

        if (messageType === 'session_keepalive') {
          this.state.setConnection({ lastKeepaliveAt: new Date().toISOString() });
          return;
        }

        if (messageType === 'session_reconnect') {
          const reconnectUrl = message.payload?.session?.reconnect_url;
          this.logger.info('Twitch requested EventSub reconnect');
          if (reconnectUrl) await this.connect(reconnectUrl, true);
          return;
        }

        if (messageType === 'notification') {
          this.handleNotification(message);
          return;
        }

        if (messageType === 'revocation') {
          const sub = message.payload?.subscription;
          this.logger.warn('Twitch revoked EventSub subscription:', sub?.type, sub?.status);
          this.state.setConnection({ lastError: `Subscription revoked: ${sub?.type} ${sub?.status}` });
        }
      } catch (error) {
        this.logger.error('Failed to handle Twitch EventSub message:', error);
        this.state.setConnection({ lastError: error.message });
      }
    });

    nextSocket.on('close', (code, reason) => {
      this.logger.warn(`Twitch EventSub socket closed: ${code} ${reason?.toString?.() || ''}`);
      if (this.socket === nextSocket || !promoted) {
        this.state.setConnection({ twitch: 'disconnected', sessionId: null });
        this.scheduleReconnect();
      }
    });

    nextSocket.on('error', (error) => {
      this.logger.error('Twitch EventSub socket error:', error.message);
      this.state.setConnection({ lastError: error.message });
    });
  }

  async subscribe(sessionId) {
    const auth = await ensureUserToken(this.config, this.authStore);
    const condition = { broadcaster_user_id: auth.userId };
    const types = [...POLL_TYPES];

    const hasRewardMap = Object.keys(this.config.redemptions.choiceMap || {}).length > 0;
    if (this.config.redemptions.enabled || hasRewardMap) {
      types.push('channel.channel_points_custom_reward_redemption.add');
    }

    const created = [];
    for (const type of types) {
      const payload = await createEventSubSubscription(this.config, this.authStore, {
        type,
        version: '1',
        condition,
        sessionId
      });
      created.push(type);
      this.logger.info(`EventSub subscription enabled: ${type}`, payload.total_cost !== undefined ? `(total_cost=${payload.total_cost})` : '');
    }

    this.state.setConnection({ twitch: 'subscribed', sessionId, subscriptions: created });
  }

  handleNotification(message) {
    const type = message.metadata?.subscription_type || message.payload?.subscription?.type;
    const event = message.payload?.event;
    if (!type || !event) return;

    if (POLL_TYPES.includes(type)) {
      this.state.setPollFromEvent(event, type);
      return;
    }

    if (type === 'channel.channel_points_custom_reward_redemption.add') {
      this.state.applyRewardRedemption(event);
    }
  }

  scheduleReconnect() {
    if (this.isStopping) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.config.twitch.eventSubWsUrl, false).catch((error) => {
        this.logger.error('Twitch EventSub reconnect failed:', error.message);
        this.state.setConnection({ lastError: error.message });
        this.scheduleReconnect();
      });
    }, 5000);
  }
}
