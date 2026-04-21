const levels = new Map([
  ['debug', 0],
  ['info', 1],
  ['warn', 2],
  ['error', 3]
]);

const currentLevel = process.env.LOG_LEVEL || 'info';

function shouldLog(level) {
  return (levels.get(level) ?? 1) >= (levels.get(currentLevel) ?? 1);
}

function write(level, args) {
  if (!shouldLog(level)) return;
  const stamp = new Date().toISOString();
  const prefix = `[${stamp}] [${level.toUpperCase()}]`;
  if (level === 'error') console.error(prefix, ...args);
  else if (level === 'warn') console.warn(prefix, ...args);
  else console.log(prefix, ...args);
}

export const logger = {
  debug: (...args) => write('debug', args),
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args)
};
