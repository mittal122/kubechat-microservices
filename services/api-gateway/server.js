const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { metricsMiddleware, metricsEndpoint } = require("./config/metrics");

dotenv.config();

const app = express();

// ── Service URLs (resolved via Docker Compose service names) ──
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://auth-service:5001";
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://user-service:5002";
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || "http://chat-service:5003";

// ── CORS Configuration ──
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

// ── Prometheus Metrics Middleware ──
app.use(metricsMiddleware);

// ── Health Check ──
app.get("/health", (req, res) => {
  res.status(200).json({
    service: "api-gateway",
    status: "healthy",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    downstream: {
      auth: AUTH_SERVICE_URL,
      user: USER_SERVICE_URL,
      chat: CHAT_SERVICE_URL,
    },
  });
});

// ── Prometheus Metrics Endpoint ──
app.get("/metrics", metricsEndpoint);

// ── Proxy Routes ──

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

// Chat Service: /api/messages/*, /api/conversations/*
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

// ═══════════════════════════════════════════════════════════════
//  Socket.IO WebSocket Proxy — CRITICAL for real-time chat
// ═══════════════════════════════════════════════════════════════
//
//  BUG FIX: In http-proxy-middleware v3, when using Express
//  mount paths (app.use("/socket.io", proxy)), Express strips
//  the mount prefix for middleware but NOT for the raw HTTP
//  server's "upgrade" event. Combined with pathRewrite, this
//  caused WebSocket upgrade requests to be proxied to
//  /socket.io/socket.io/ (double prefix) — which doesn't exist.
//
//  FIX: Do NOT use an Express mount path for the socket proxy.
//  Instead, use the middleware globally and let it match
//  /socket.io paths itself. This way BOTH HTTP polling AND
//  WebSocket upgrade see the correct, unmodified path.
// ═══════════════════════════════════════════════════════════════
const socketProxy = createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  // NO pathRewrite needed — the path /socket.io/... is already
  // correct and maps directly to chat-service's Socket.IO
  pathFilter: "/socket.io",
  logger: console,
  on: {
    error: (err, req, res) => {
      console.error("WebSocket proxy error:", err.message);
    },
    proxyReqWs: (proxyReq, req, socket, options, head) => {
      console.log(`🔌 WS upgrade proxied: ${req.url} → ${CHAT_SERVICE_URL}${req.url}`);
    },
  },
});

// Use globally (not on a sub-path) so path is preserved for both
// HTTP polling requests and WebSocket upgrade events
app.use(socketProxy);

// ── Fallback ──
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── Start Server (http.createServer required for WS upgrade proxying) ──
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Forward WebSocket upgrade events to the proxy handler
// In http-proxy-middleware v3, we must call .upgrade(req, socket, head)
// with the full unmodified path — which we get from the raw server event
server.on("upgrade", (req, socket, head) => {
  console.log(`⬆️  WS Upgrade request: ${req.url}`);
  socketProxy.upgrade(req, socket, head);
});

server.listen(PORT, () => {
  console.log(`🚪 API Gateway running on port ${PORT}`);
  console.log(`   → Auth:  ${AUTH_SERVICE_URL}`);
  console.log(`   → Users: ${USER_SERVICE_URL}`);
  console.log(`   → Chat:  ${CHAT_SERVICE_URL}`);
  console.log(`   → Socket.IO proxy: /socket.io → ${CHAT_SERVICE_URL}`);
});
