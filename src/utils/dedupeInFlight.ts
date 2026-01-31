const inFlight = new Map<string, Promise<unknown>>();

export async function dedupeInFlight<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<{ value: T; deduped: boolean }> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    return { value: await existing, deduped: true };
  }

  const p = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, p as Promise<unknown>);

  return { value: await p, deduped: false };
}
