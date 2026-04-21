import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { getConfig } from './config.js';
import { AuthStore } from './authStore.js';
import { SettingsStore } from './settingsStore.js';
import { logger } from './logger.js';
import { buildLoginUrl, createStateToken, exchangeCodeForToken, getCurrentTwitchUser, normalizeTokenPayload } from './twitchAuth.js';
import { getLatestPoll } from './twitchApi.js';
import { createPollRouteHandler } from './createPollRoute.js';
import { OverlayState } from './state.js';
import { OverlayHub } from './overlayHub.js';
import { EventSubClient } from './eventsubClient.js';
import { DemoRunner } from './demo.js';
import { normalizeTargetChannelLogin } from './targetChannel.js';

const config = getConfig();
const app = express();
const server = http.createServer(app);
const authStore = new AuthStore(config.authFile);
const settingsStore = new SettingsStore(config.settingsFile);
const state = new OverlayState({
  rewardChoiceMap: config.redemptions.choiceMap,
  rewardsTitle: config.redemptions.title
});
const hub = new OverlayHub({ state, token: config.overlay.token, logger });
const eventSub = new EventSubClient({ config, authStore, state, logger });
const demo = new DemoRunner({ state, logger });
const oauthStates = new Map();

app.use(express.json());
app.use(express.static(path.join(config.projectRoot, 'public')));

function requireOverlayToken(req, res, next) {
  if (!config.overlay.token) return next();
  const token = req.get('X-Overlay-Token') || req.query.token || req.body?.token || '';
  if (token !== config.overlay.token) return res.status(401).json({ error: 'Invalid overlay token' });
  next();
}

function htmlPage(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#111827;color:#e5e7eb;line-height:1.5;padding:32px;max-width:980px;margin:auto}a{color:#a78bfa}.card{background:#1f2937;border:1px solid #374151;border-radius:16px;padding:20px;margin:16px 0}code{background:#0b1020;padding:2px 6px;border-radius:6px}</style></head><body>${body}</body></html>`;
}

app.get('/', (req, res) => {
  const tokenParam = config.overlay.token ? `?token=${encodeURIComponent(config.overlay.token)}` : '';
  res.type('html').send(htmlPage('Twitch Poll Scale Overlay', `
    <h1>Twitch Poll Scale Overlay</h1>
    <div class="card">
      <p>Admin: <a href="/admin${tokenParam}">/admin${tokenParam}</a></p>
      <p>OBS Scale URL: <code>${config.publicBaseUrl}/overlay?token=${config.overlay.token || ''}&mode=scale&metric=votes</code></p>
      <p>OBS Bars URL: <code>${config.publicBaseUrl}/overlay?token=${config.overlay.token || ''}&mode=bars&metric=votes</code></p>
      <p>Twitch login: <a href="/auth/login">/auth/login</a></p>
    </div>
  `));
});

app.get('/overlay', (req, res) => {
  res.sendFile(path.join(config.projectRoot, 'public', 'overlay.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(config.projectRoot, 'public', 'admin.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    overlayTokenEnabled: Boolean(config.overlay.token),
    defaultMode: config.overlay.defaultMode,
    defaultMetric: config.overlay.defaultMetric,
    snapshot: state.getSnapshot()
  });
});

app.get('/api/snapshot', (req, res) => {
  res.json(state.getSnapshot());
});

app.post('/api/demo/start', requireOverlayToken, (req, res) => {
  demo.start({
    title: req.body?.title || 'Demo vote: who wins?',
    choices: Array.isArray(req.body?.choices) && req.body.choices.length >= 2 ? req.body.choices.slice(0, 5) : ['Team Left', 'Team Right']
  });
  res.json({ ok: true, snapshot: state.getSnapshot() });
});

app.post('/api/demo/stop', requireOverlayToken, (req, res) => {
  demo.stop();
  res.json({ ok: true });
});

app.post('/api/reset', requireOverlayToken, (req, res) => {
  demo.stop();
  state.resetPoll();
  res.json({ ok: true });
});

app.post('/api/twitch/recover-latest-poll', requireOverlayToken, async (req, res) => {
  try {
    const poll = await getLatestPoll(config, authStore);
    if (poll) state.setPollFromHelix(poll);
    res.json({ ok: true, poll, snapshot: state.getSnapshot() });
  } catch (error) {
    logger.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post(
  '/api/twitch/create-poll',
  requireOverlayToken,
  createPollRouteHandler({ config, authStore, state, logger })
);

app.post('/api/settings/target-channel', requireOverlayToken, async (req, res) => {
  try {
    const login = normalizeTargetChannelLogin(req.body?.login);
    await settingsStore.save({ targetChannelLogin: login });
    if (login) state.setTargetChannel({ login, source: 'saved' });
    else state.setTargetChannel(null);
    res.json({ ok: true, snapshot: state.getSnapshot() });
  } catch (error) {
    res.status(400).json({
      error: {
        code: 'validation',
        message: error.message || 'Invalid target channel login.',
        hint: 'login'
      }
    });
  }
});

app.post('/api/twitch/reconnect', requireOverlayToken, async (req, res) => {
  try {
    await eventSub.start();
    res.json({ ok: true });
  } catch (error) {
    logger.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/auth/login', (req, res) => {
  if (!config.twitch.clientId || !config.twitch.clientSecret) {
    res.status(500).type('html').send(htmlPage('Twitch auth not configured', '<h1>Twitch auth not configured</h1><p>Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env.</p>'));
    return;
  }

  const stateToken = createStateToken();
  oauthStates.set(stateToken, Date.now() + 10 * 60 * 1000);
  res.redirect(buildLoginUrl(config, stateToken));
});

app.get('/auth/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const stateToken = String(req.query.state || '');
    const expiresAt = oauthStates.get(stateToken);
    oauthStates.delete(stateToken);

    if (!code) throw new Error('Missing OAuth code');
    if (!expiresAt || expiresAt < Date.now()) throw new Error('Invalid or expired OAuth state');

    const tokenPayload = await exchangeCodeForToken(config, code);
    const user = await getCurrentTwitchUser(config, tokenPayload.access_token);
    const auth = normalizeTokenPayload(tokenPayload, user, config.twitch.scopes);
    await authStore.save(auth);
    state.setAuth(auth);

    demo.stop();
    await eventSub.start();

    try {
      const poll = await getLatestPoll(config, authStore);
      if (poll?.status === 'ACTIVE') state.setPollFromHelix(poll);
    } catch (error) {
      logger.warn('Latest poll recovery skipped:', error.message);
    }

    res.type('html').send(htmlPage('Twitch connected', `
      <h1>Twitch connected</h1>
      <div class="card">
        <p>Authorized as <strong>${auth.userName}</strong> (@${auth.userLogin}).</p>
        <p>Open <a href="/admin${config.overlay.token ? `?token=${encodeURIComponent(config.overlay.token)}` : ''}">admin</a> or add the OBS URL.</p>
      </div>
    `));
  } catch (error) {
    logger.error(error.message);
    res.status(500).type('html').send(htmlPage('Twitch auth failed', `<h1>Twitch auth failed</h1><pre>${String(error.message)}</pre>`));
  }
});

app.post('/auth/logout', requireOverlayToken, async (req, res) => {
  demo.stop();
  eventSub.stop();
  await authStore.clear();
  state.setAuth(null);
  state.resetPoll();
  res.json({ ok: true });
});

async function main() {
  await authStore.load();
  const settings = await settingsStore.load();
  const auth = authStore.get();
  if (auth) state.setAuth(auth);

  const hasSavedTarget = Object.prototype.hasOwnProperty.call(settings, 'targetChannelLogin');
  const targetChannelLogin = hasSavedTarget
    ? normalizeTargetChannelLogin(settings.targetChannelLogin)
    : normalizeTargetChannelLogin(config.targetChannel.defaultLogin);
  if (targetChannelLogin) {
    state.setTargetChannel({
      login: targetChannelLogin,
      source: hasSavedTarget ? 'saved' : 'env'
    });
  }

  hub.attach(server);

  server.listen(config.port, async () => {
    logger.info(`Server started: ${config.publicBaseUrl}`);
    if (!config.overlay.token) logger.warn('OVERLAY_TOKEN is empty. Set it before streaming publicly.');
    logger.info(`Admin URL: ${config.publicBaseUrl}/admin${config.overlay.token ? `?token=${config.overlay.token}` : ''}`);
    logger.info(`OBS URL: ${config.publicBaseUrl}/overlay?token=${config.overlay.token || ''}&mode=${config.overlay.defaultMode}&metric=${config.overlay.defaultMetric}`);

    if (auth?.accessToken) {
      try {
        await eventSub.start();
        const poll = await getLatestPoll(config, authStore);
        if (poll?.status === 'ACTIVE') state.setPollFromHelix(poll);
      } catch (error) {
        logger.warn('Twitch startup connection skipped:', error.message);
      }
    } else if (config.demoOnStart) {
      demo.start();
    }
  });
}

main().catch((error) => {
  logger.error(error);
  process.exitCode = 1;
});
