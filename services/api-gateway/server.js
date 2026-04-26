/**
 * API Gateway — Single Entry Point for All Client Traffic
 *
 * Role: "Smart Traffic Cop" (API Gateway pattern)
 *   Every request from the Flutter app or React web app arrives here first.
 *   The gateway inspects the URL path and reverse-proxies the request to the
 *   correct downstream microservice, then returns that service's response
 *   unchanged to the client.
 *
 * Routing table:
 *   /api/auth/*          → auth-service:5001
 *   /api/users/*         → user-service:5002
 *   /api/messages/*      → chat-service:5003
 *   /api/conversations/* → chat-service:5003
 *   /socket.io/*         → chat-service:5003  (WebSocket upgrade)
 *
 * Cross-cutting concerns handled here (not in individual services):
 *   - CORS  (one config for all routes)
 *   - Prometheus metrics  (one middleware for all routes)
 *   - Structured 502 error responses  (per-route error handlers)
 *   - Health check  (used by Kubernetes liveness/readiness probes)
 *
 * See docs/API_GATEWAY_DEEP_DIVE.md for a full walkthrough.
 */

const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { metricsMiddleware, metricsEndpoint } = require("./config/metrics");

dotenv.config();

const app = express();

// ── Service URLs ──────────────────────────────────────────────────────────────
// Resolved via Docker Compose service names or Kubernetes cluster DNS.
// Clients never see these internal addresses — they only know the gateway URL.
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://auth-service:5001";
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://user-service:5002";
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || "http://chat-service:5003";

// ── CORS Configuration ────────────────────────────────────────────────────────
// Centralised here so individual microservices do not need their own CORS setup.
// CORS_ORIGIN defaults to "*" for development; set to the real domain in prod
// (e.g. "https://chat.yourdomain.com") via the environment variable.
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

// ── Prometheus Metrics Middleware ─────────────────────────────────────────────
// Wraps every request: starts a timer, and once the response finishes it records
// http_requests_total and http_request_duration_seconds into the Prometheus
// registry.  Prometheus scrapes GET /metrics; Grafana queries Prometheus.
app.use(metricsMiddleware);

// ── Health Check ──────────────────────────────────────────────────────────────
// Kubernetes startup, readiness, and liveness probes all call GET /health.
// Deliberately lightweight — no DB call, no downstream service call.
// Returns the configured downstream URLs so operators can verify env vars.
app.get("/health", (req, res) => {
  res.status(200).json({
    service: "api-gateway",
    status: "healthy",
    uptime: Math.floor(process.uptime()),   // seconds since Node process started
    timestamp: new Date().toISOString(),
    downstream: {
      auth: AUTH_SERVICE_URL,
      user: USER_SERVICE_URL,
      chat: CHAT_SERVICE_URL,
    },
  });
});

// ── Prometheus Metrics Endpoint ───────────────────────────────────────────────
// Prometheus scrapes this endpoint on a schedule (default every 15 s).
// Returns all registered metrics in plain-text Prometheus exposition format.
app.get("/metrics", metricsEndpoint);

// ── Proxy Routes ──────────────────────────────────────────────────────────────
//
// PATH-REWRITE NOTE (applies to every route below):
//   When Express mounts a proxy at "/api/auth", it strips that prefix before
//   handing the request to the middleware.  So a client request for
//   POST /api/auth/login arrives at http-proxy-middleware as POST /login.
//   The pathRewrite rule "^/" → "/api/auth/" re-adds the stripped prefix so
//   the upstream service receives the full path it expects:
//
//     Client:    POST /api/auth/login
//     Express:   POST /login            (mount prefix stripped)
//     Rewrite:   POST /api/auth/login   (prefix restored)
//     Upstream:  POST /api/auth/login   ✅
//
// ERROR HANDLING NOTE:
//   The on.error callback fires when the gateway cannot reach the upstream
//   (e.g., service is down, DNS lookup failed, TCP refused).  It returns
//   HTTP 502 Bad Gateway — the correct status for "proxy couldn't reach upstream".

// Auth Service: /api/auth/*
app.use("/api/auth", createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { "^/": "/api/auth/" },
  on: {
    error: (err, req, res) => {
      console.error("Auth proxy error:", err.message);
      res.status(502).json({ message: "Auth service unavailable" });
    },
  },
}));

// User Service: /api/users/*
app.use("/api/users", createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { "^/": "/api/users/" },
  on: {
    error: (err, req, res) => {
      console.error("User proxy error:", err.message);
      res.status(502).json({ message: "User service unavailable" });
    },
  },
}));

// Chat Service: REST messages — /api/messages/*
app.use("/api/messages", createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { "^/": "/api/messages/" },
  on: {
    error: (err, req, res) => {
      console.error("Chat proxy error:", err.message);
      res.status(502).json({ message: "Chat service unavailable" });
    },
  },
}));

// Chat Service: REST conversations — /api/conversations/*
app.use("/api/conversations", createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { "^/": "/api/conversations/" },
  on: {
    error: (err, req, res) => {
      console.error("Chat proxy error:", err.message);
      res.status(502).json({ message: "Chat service unavailable" });
    },
  },
}));

// ── Socket.IO WebSocket Proxy ─────────────────────────────────────────────────
// Real-time chat uses Socket.IO which upgrades an HTTP connection to a
// persistent WebSocket.  Proxying a WebSocket requires intercepting the raw
// TCP "Upgrade" event — Express cannot do this on its own.
//
// Two-layer setup:
//   1. app.use("/socket.io", socketProxy)   — handles Socket.IO HTTP polling
//      (the initial handshake phase before the WebSocket upgrade)
//   2. server.on("upgrade", socketProxy.upgrade)  — handles the raw TCP upgrade
//      event so the persistent WebSocket tunnel reaches the chat service
//
// ws: true  tells http-proxy-middleware to also proxy WebSocket connections
// when they arrive on the same Express route.
const socketProxy = createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  pathRewrite: { "^/": "/socket.io/" },   // same prefix-restoration logic as above
  on: {
    error: (err, req, res) => {
      console.error("WebSocket proxy error:", err.message);
    },
  },
});
app.use("/socket.io", socketProxy);

// ── Fallback: 404 for Unknown Routes ─────────────────────────────────────────
// Any request that does not match the routes above gets a clean JSON 404.
// This prevents raw Express HTML error pages from leaking to clients.
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── Start Server ──────────────────────────────────────────────────────────────
// IMPORTANT: We use http.createServer(app) instead of app.listen() because
// app.listen() does not expose the underlying server object.  Without the
// server object we cannot attach the 'upgrade' event listener that is required
// for WebSocket proxying (see socketProxy.upgrade below).
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Forward raw TCP WebSocket upgrade events to the socketProxy handler.
// Without this line, Socket.IO connections would fail at the upgrade phase
// even though the initial HTTP polling handshake succeeds.
server.on("upgrade", socketProxy.upgrade);

server.listen(PORT, () => {
  console.log(`🚪 API Gateway running on port ${PORT}`);
  console.log(`   → Auth:  ${AUTH_SERVICE_URL}`);
  console.log(`   → Users: ${USER_SERVICE_URL}`);
  console.log(`   → Chat:  ${CHAT_SERVICE_URL}`);
});
