type Labels = Record<string, string>;

const counters = new Map<string, number>();
const histBucketsMs = [5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000];
const histCount = new Map<string, number>();
const histSum = new Map<string, number>();
const histBucket = new Map<string, number>();

function labelsToKey(labels: Labels) {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`);
  return parts.join(',');
}

function inc(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

export function recordHttpRequest(
  labels: { method: string; path: string; status: string },
  durationMs: number,
) {
  const baseKey = labelsToKey(labels);
  inc(counters, baseKey, 1);

  inc(histCount, baseKey, 1);
  inc(histSum, baseKey, durationMs);

  for (const le of histBucketsMs) {
    if (durationMs <= le) {
      inc(histBucket, `${baseKey},le=${le}`, 1);
    }
  }
  inc(histBucket, `${baseKey},le=+Inf`, 1);
}

function formatLabels(key: string) {
  if (!key) return '';
  const parts = key.split(',').map((kv) => {
    const [k, v] = kv.split('=');
    return `${k}="${String(v).replace(/"/g, '\\"')}"`;
  });
  return `{${parts.join(',')}}`;
}

export function renderPrometheusMetrics() {
  const lines: string[] = [];
  lines.push('# HELP http_requests_total Total HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  for (const [key, value] of counters) {
    lines.push(`http_requests_total${formatLabels(key)} ${value}`);
  }

  lines.push('# HELP http_request_duration_ms HTTP request duration in milliseconds');
  lines.push('# TYPE http_request_duration_ms histogram');
  for (const [key, value] of histBucket) {
    lines.push(`http_request_duration_ms_bucket${formatLabels(key)} ${value}`);
  }
  for (const [key, value] of histSum) {
    lines.push(`http_request_duration_ms_sum${formatLabels(key)} ${value}`);
  }
  for (const [key, value] of histCount) {
    lines.push(`http_request_duration_ms_count${formatLabels(key)} ${value}`);
  }

  return lines.join('\n') + '\n';
}
