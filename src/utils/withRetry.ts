import { sleep } from './sleep';

type RetryOptions = {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (err: unknown) => boolean;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries, baseDelayMs, maxDelayMs, shouldRetry }: RetryOptions,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      if (shouldRetry && !shouldRetry(err)) break;

      const expDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * baseDelayMs);
      const delay = Math.min(maxDelayMs, expDelay + jitter);
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
