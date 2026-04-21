const TWITCH_LOGIN_RE = /^[a-z0-9_]{1,25}$/;

export function normalizeTargetChannelLogin(rawValue) {
  const login = String(rawValue || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();

  if (!login) return '';
  if (!TWITCH_LOGIN_RE.test(login)) {
    throw new Error('Target channel login must use only letters, numbers, or underscores.');
  }
  return login;
}
