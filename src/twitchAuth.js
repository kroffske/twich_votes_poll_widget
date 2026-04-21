import crypto from 'node:crypto';

const AUTH_BASE = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX_USERS_URL = 'https://api.twitch.tv/helix/users';

export function createStateToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function buildLoginUrl(config, state) {
  const url = new URL(AUTH_BASE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.twitch.clientId);
  url.searchParams.set('redirect_uri', config.twitch.redirectUri);
  url.searchParams.set('scope', config.twitch.scopes.join(' '));
  url.searchParams.set('state', state);
  // force_verify=true forces Twitch to show the consent screen on every /auth/login,
  // so scope bumps in .env are picked up on re-login instead of silently reusing the
  // old grant. Trade-off: one extra click per login on this local-dev app — cheaper
  // than silent scope drift after TWITCH_SCOPES changes.
  url.searchParams.set('force_verify', 'true');
  return url.toString();
}

export async function exchangeCodeForToken(config, code) {
  const body = new URLSearchParams();
  body.set('client_id', config.twitch.clientId);
  body.set('client_secret', config.twitch.clientSecret);
  body.set('code', code);
  body.set('grant_type', 'authorization_code');
  body.set('redirect_uri', config.twitch.redirectUri);

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twitch token exchange failed: HTTP ${response.status} ${text}`);
  }

  return response.json();
}

export async function refreshAccessToken(config, refreshToken) {
  const body = new URLSearchParams();
  body.set('client_id', config.twitch.clientId);
  body.set('client_secret', config.twitch.clientSecret);
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twitch token refresh failed: HTTP ${response.status} ${text}`);
  }

  return response.json();
}

export async function getCurrentTwitchUser(config, accessToken) {
  const response = await fetch(HELIX_USERS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': config.twitch.clientId
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twitch users lookup failed: HTTP ${response.status} ${text}`);
  }

  const payload = await response.json();
  const user = payload.data?.[0];
  if (!user) throw new Error('Twitch users lookup returned no user');
  return user;
}

// Twitch's token endpoint returns `scope` as an array of strings, but some flows
// (and older docs) return it as a space-delimited string. Accept both, fall back
// to the requested scopes if the field is missing entirely.
export function parseTokenScopes(rawScope, requestedScopes) {
  if (Array.isArray(rawScope)) return rawScope;
  if (typeof rawScope === 'string' && rawScope.trim().length > 0) {
    return rawScope.split(/\s+/).filter(Boolean);
  }
  return requestedScopes;
}

export function normalizeTokenPayload(tokenPayload, user, requestedScopes) {
  const now = Date.now();
  const expiresInMs = Number(tokenPayload.expires_in || 0) * 1000;
  return {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: expiresInMs ? now + expiresInMs : now + 3600 * 1000,
    scopes: parseTokenScopes(tokenPayload.scope, requestedScopes),
    userId: user.id,
    userLogin: user.login,
    userName: user.display_name || user.login,
    savedAt: new Date(now).toISOString()
  };
}
