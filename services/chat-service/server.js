const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const messageRoutes = require("./routes/messageRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const { metricsMiddleware, metricsEndpoint } = require("./config/metrics");
const { initSocket } = require("./socket/socket");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// ── Initialize Socket.IO ──
initSocket(server);

// ── CORS Configuration ──
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));
app.use(express.json());

// ── Prometheus Metrics Middleware ──
app.use(metricsMiddleware);

// ── Routes ──
app.use("/api/messages", messageRoutes);
app.use("/api/conversations", conversationRoutes);

// ── Health Check ──
app.get("/health", async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const healthReport = {
    service: "chat-service",
    status: mongoState === 1 ? "healthy" : "degraded",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    mongodb: mongoState === 1 ? "connected" : "disconnected",
  };

  // Check Redis if available
  if (process.env.REDIS_URL) {
    try {
      const Redis = require("ioredis");
      const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 2000 });
      await redis.connect();
      const pong = await redis.ping();
      healthReport.redis = pong === "PONG" ? "connected" : "disconnected";
      await redis.quit();
    } catch (redisErr) {
      healthReport.redis = "disconnected";
      healthReport.status = "degraded";
    }
  } else {
    healthReport.redis = "not_configured";
  }

  res.status(healthReport.status === "healthy" ? 200 : 503).json(healthReport);
});

// ── Prometheus Metrics Endpoint ──
app.get("/metrics", metricsEndpoint);

// ── Start Server ──
const PORT = process.env.PORT || 5003;
server.listen(PORT, () => {
  console.log(`💬 Chat Service running on port ${PORT}`);
});

// ── Graceful Shutdown ──
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down chat-service...`);
  server.close(() => {
    console.log("✅ HTTP server closed");
    mongoose.connection.close(false).then(() => {
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    }).catch((err) => {
      console.error("❌ Error closing MongoDB:", err);
      process.exit(1);
    });
  });

  setTimeout(() => {
    console.error("⚠️  Forceful shutdown after 10s timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
