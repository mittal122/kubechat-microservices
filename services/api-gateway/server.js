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
// Note: Express strips the mount path, so req.url arriving here is e.g. "/register".
// pathRewrite re-adds the prefix so auth-service sees "/api/auth/register".
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

// Socket.IO WebSocket Proxy — CRITICAL for real-time chat
// Note: pathRewrite restores the /socket.io prefix (Express strips mount path).
// The http server's upgrade event is forwarded below so WS handshakes work.
const socketProxy = createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  pathRewrite: { "^/": "/socket.io/" },
  on: {
    error: (err, req, res) => {
      console.error("WebSocket proxy error:", err.message);
    },
  },
});
app.use("/socket.io", socketProxy);

// ── Fallback ──
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── Start Server (http.createServer required for WS upgrade proxying) ──
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Forward WebSocket upgrade events to the socketProxy handler
server.on("upgrade", socketProxy.upgrade);

server.listen(PORT, () => {
  console.log(`🚪 API Gateway running on port ${PORT}`);
  console.log(`   → Auth:  ${AUTH_SERVICE_URL}`);
  console.log(`   → Users: ${USER_SERVICE_URL}`);
  console.log(`   → Chat:  ${CHAT_SERVICE_URL}`);
});
