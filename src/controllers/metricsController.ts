import { renderPrometheusMetrics } from '../services/metrics';

export function getMetricsController() {
  return renderPrometheusMetrics();
}
