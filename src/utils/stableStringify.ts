export function stableStringify(value: unknown): string {
  return JSON.stringify(sortRec(value));
}

function sortRec(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortRec);

  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    out[key] = sortRec(rec[key]);
  }
  return out;
}
