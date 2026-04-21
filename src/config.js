import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const envFile = process.env.OVERLAY_ENV_FILE || path.join(projectRoot, '.env');

dotenv.config({ path: envFile });

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseJsonObject(value, fallback = {}) {
  if (!value || !String(value).trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function splitScopes(value) {
  const raw = value || 'channel:read:polls channel:read:redemptions channel:manage:polls';
  return raw.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
}

export function getConfig() {
  const port = Number(process.env.PORT || 3030);
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  const dataDir = process.env.OVERLAY_DATA_DIR || path.join(projectRoot, 'data');

  return {
    projectRoot,
    envFile,
    port,
    publicBaseUrl,
    dataDir,
    authFile: path.join(dataDir, 'auth.json'),
    settingsFile: path.join(dataDir, 'settings.json'),
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID || '',
      clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
      redirectUri: process.env.TWITCH_REDIRECT_URI || `${publicBaseUrl}/auth/callback`,
      scopes: splitScopes(process.env.TWITCH_SCOPES),
      eventSubWsUrl: 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30'
    },
    targetChannel: {
      defaultLogin: process.env.TWITCH_TARGET_CHANNEL_LOGIN || ''
    },
    overlay: {
      token: process.env.OVERLAY_TOKEN || '',
      defaultMode: process.env.DEFAULT_OVERLAY_MODE || 'scale',
      defaultMetric: process.env.DEFAULT_OVERLAY_METRIC || 'votes'
    },
    demoOnStart: bool(process.env.DEMO_ON_START, true),
    redemptions: {
      enabled: bool(process.env.ENABLE_REDEMPTIONS, false),
      choiceMap: parseJsonObject(process.env.REWARD_CHOICE_MAP_JSON, {}),
      title: process.env.REWARDS_POLL_TITLE || 'Channel Points Battle'
    }
  };
}
