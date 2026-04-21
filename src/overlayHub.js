import { WebSocketServer } from 'ws';

function tokenFromRequest(req) {
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('token') || '';
}

export class OverlayHub {
  constructor({ state, token, logger }) {
    this.state = state;
    this.token = token || '';
    this.logger = logger;
    this.wss = null;
  }

  attach(server) {
    this.wss = new WebSocketServer({ server, path: '/ws/overlay' });

    this.wss.on('connection', (socket, req) => {
      if (this.token && tokenFromRequest(req) !== this.token) {
        socket.close(1008, 'Invalid overlay token');
        return;
      }

      this.logger.info('OBS overlay connected');
      socket.send(JSON.stringify({ type: 'snapshot', payload: this.state.getSnapshot() }));

      socket.on('close', () => this.logger.info('OBS overlay disconnected'));
      socket.on('error', (error) => this.logger.warn('OBS overlay socket error:', error.message));
    });

    this.state.on('changed', (snapshot) => {
      this.broadcast({ type: 'snapshot', payload: snapshot });
    });
  }

  broadcast(message) {
    if (!this.wss) return;
    const raw = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === 1) client.send(raw);
    }
  }
}
