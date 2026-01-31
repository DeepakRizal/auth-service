import { env } from './env';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

const levelPriority: Record<Exclude<LogLevel, 'silent'>, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

function shouldLog(level: Exclude<LogLevel, 'silent'>) {
  const configured = (env.LOG_LEVEL ?? 'info') as LogLevel;
  if (configured === 'silent') return false;
  return levelPriority[level] >= levelPriority[configured as Exclude<LogLevel, 'silent'>];
}

function toMessage(input: unknown) {
  if (input instanceof Error) return input.stack ?? input.message;
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function log(level: Exclude<LogLevel, 'silent'>, objOrMsg: unknown, msg?: string) {
  if (!shouldLog(level)) return;

  const time = new Date().toISOString();
  const prefix = `[${time}] ${level.toUpperCase()}`;

  if (msg !== undefined) {
    const safeObj = objOrMsg;
    const consoleFn =
      level === 'fatal' || level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log;
    consoleFn(prefix, msg, safeObj);
    return;
  }

  const text = toMessage(objOrMsg);
  const consoleFn =
    level === 'fatal' || level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log;
  consoleFn(prefix, text);
}

export const logger = {
  fatal: (objOrMsg: unknown, msg?: string) => log('fatal', objOrMsg, msg),
  error: (objOrMsg: unknown, msg?: string) => log('error', objOrMsg, msg),
  warn: (objOrMsg: unknown, msg?: string) => log('warn', objOrMsg, msg),
  info: (objOrMsg: unknown, msg?: string) => log('info', objOrMsg, msg),
  debug: (objOrMsg: unknown, msg?: string) => log('debug', objOrMsg, msg),
  trace: (objOrMsg: unknown, msg?: string) => log('trace', objOrMsg, msg),
};
