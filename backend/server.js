const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const conversationRoutes = require("./routes/conversationRoutes");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const { app, server } = require("./socket/socket");

// ── CORS Configuration ──
// Production: set CORS_ORIGIN env var to lock down to your domain
// Development: defaults to "*" for local testing
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/conversations", conversationRoutes);

// Health check (basic — for backward compatibility)
app.get("/", (req, res) => {
  res.json({ message: "Chat Application API is running" });
});

// ── Deep Health Check ──
// Used by Kubernetes readiness/liveness probes and ALB target group health checks.
// Reports the status of all critical dependencies (MongoDB, Redis).
app.get("/health", async (req, res) => {
  try {
    const mongoState = mongoose.connection.readyState; // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting

    const healthReport = {
      status: mongoState === 1 ? "healthy" : "degraded",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoState === 1 ? "connected" : "disconnected",
      },
    };

    // Check Redis if available
    if (process.env.REDIS_URL) {
      try {
        const Redis = require("ioredis");
        const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 2000 });
        await redis.connect();
        const pong = await redis.ping();
        healthReport.services.redis = pong === "PONG" ? "connected" : "disconnected";
        await redis.quit();
      } catch (redisErr) {
        healthReport.services.redis = "disconnected";
        healthReport.status = "degraded";
      }
    } else {
      healthReport.services.redis = "not_configured";
    }

    const statusCode = healthReport.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(healthReport);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ── Graceful Shutdown ──
// When Kubernetes sends SIGTERM (during rolling updates or pod eviction),
// we cleanly close all connections before the process exits.
// This prevents in-flight requests from being dropped and ensures
// connected WebSocket clients get properly disconnected.
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log("✅ HTTP server closed");

    // Close MongoDB connection
    mongoose.connection.close(false).then(() => {
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    }).catch((err) => {
      console.error("❌ Error closing MongoDB:", err);
      process.exit(1);
    });
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error("⚠️  Forceful shutdown after 10s timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
