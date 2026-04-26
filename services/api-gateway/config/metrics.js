/**
 * Prometheus Metrics for the API Gateway
 *
 * Three custom metrics are registered:
 *
 *   1. http_request_duration_seconds  (Histogram)
 *      Measures how long each request takes.  Use PromQL like
 *      histogram_quantile(0.99, ...) to find the 99th-percentile latency.
 *
 *   2. http_requests_total  (Counter)
 *      Counts every request by method, route, and status code.
 *      Use rate(http_requests_total[5m]) to see requests-per-second.
 *
 *   3. gateway_proxy_errors_total  (Counter)
 *      Counts proxy failures by target service name.
 *      Useful for alerting when a downstream service becomes unreachable.
 *
 * collectDefaultMetrics() also registers built-in Node.js metrics:
 *   CPU usage, memory heap, event-loop lag, GC stats, file-descriptor count.
 *
 * Prometheus scrapes GET /metrics on a configurable interval (default 15 s).
 * Grafana queries Prometheus to build dashboards and alerts.
 *
 * See docs/API_GATEWAY_DEEP_DIVE.md §9 for a full walkthrough.
 */

const client = require("prom-client");

// One shared registry for all metrics in this service.
const register = new client.Registry();

// Built-in Node.js process and runtime metrics (CPU, memory, GC, etc.)
client.collectDefaultMetrics({ register });

// ── Metric 1: Request Latency Histogram ──────────────────────────────────────
// A histogram groups observations into configurable "buckets" (latency ranges).
// This lets Prometheus compute percentile queries like p50, p95, p99.
// Buckets here cover: 10 ms, 50 ms, 100 ms, 300 ms, 500 ms, 1 s, 2 s, 5 s.
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// ── Metric 2: Request Counter ─────────────────────────────────────────────────
// A counter only ever increases (resets to 0 on process restart).
// Labels let you slice traffic by HTTP method, URL path, and response status.
const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// ── Metric 3: Proxy Error Counter ─────────────────────────────────────────────
// Counts the number of times the gateway failed to reach a downstream service.
// The target_service label (e.g. "auth", "user", "chat") identifies which
// upstream is having problems, enabling targeted alerting.
const gatewayProxyErrors = new client.Counter({
  name: "gateway_proxy_errors_total",
  help: "Total number of proxy errors in the gateway",
  labelNames: ["target_service"],
  registers: [register],
});

// ── Middleware: Record Metrics on Every Request ────────────────────────────────
// Attaches a "finish" listener to the response object so we record latency and
// count *after* the full response has been sent (not at request arrival time).
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;   // milliseconds → seconds
    const route = req.originalUrl || req.path;
    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );
    httpRequestTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
  });
  next();
};

// ── Endpoint: Serve Metrics to Prometheus ─────────────────────────────────────
// Returns all registered metrics serialised in Prometheus plain-text format.
// The Content-Type header tells Prometheus which parser to use.
const metricsEndpoint = async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
};

module.exports = { metricsMiddleware, metricsEndpoint, gatewayProxyErrors, register };
