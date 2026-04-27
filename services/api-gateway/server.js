const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
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

// ══════════════════════════════════════════════════════════════
//  REST API Proxies (http-proxy-middleware — works fine for HTTP)
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
//  Socket.IO Proxy — using raw http-proxy for RELIABILITY
// ══════════════════════════════════════════════════════════════
//
//  WHY NOT http-proxy-middleware for WebSocket?
//  In v3, pathFilter + Express mount paths + pathRewrite caused
//  WebSocket upgrade paths to be mangled (/socket.io/socket.io/).
//  Raw http-proxy gives us DIRECT control over both HTTP polling
//  and WebSocket upgrade — no middleware magic, no path mangling.
// ══════════════════════════════════════════════════════════════

const wsProxy = httpProxy.createProxyServer({
  target: CHAT_SERVICE_URL,
  ws: true,
  changeOrigin: true,
});

wsProxy.on("error", (err, req, res) => {
  console.error("❌ Socket proxy error:", err.message);
  // Don't crash — just log the error
});

wsProxy.on("open", () => {
  console.log("🔗 WebSocket connection opened to chat-service");
});

wsProxy.on("close", () => {
  console.log("🔗 WebSocket connection closed");
});

// Proxy Socket.IO HTTP requests (polling transport)
app.use("/socket.io", (req, res) => {
  console.log(`📡 Socket.IO HTTP: ${req.method} ${req.url}`);
  wsProxy.web(req, res);
});

// ── Fallback ──
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── Start Server ──
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Proxy WebSocket upgrade events DIRECTLY — no middleware involved
// This is the critical path for real-time messaging
server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/socket.io")) {
    console.log(`⬆️  WS Upgrade: ${req.url} → ${CHAT_SERVICE_URL}`);
    wsProxy.ws(req, socket, head);
  } else {
    console.log(`⬆️  WS Upgrade REJECTED (not socket.io): ${req.url}`);
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`🚪 API Gateway running on port ${PORT}`);
  console.log(`   → Auth:  ${AUTH_SERVICE_URL}`);
  console.log(`   → Users: ${USER_SERVICE_URL}`);
  console.log(`   → Chat:  ${CHAT_SERVICE_URL}`);
  console.log(`   → Socket.IO: raw http-proxy → ${CHAT_SERVICE_URL}`);
});
