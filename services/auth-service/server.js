const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const { metricsMiddleware, metricsEndpoint } = require("./config/metrics");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

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
app.use("/api/auth", authRoutes);

// ── Health Check ──
app.get("/health", async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  res.status(mongoState === 1 ? 200 : 503).json({
    service: "auth-service",
    status: mongoState === 1 ? "healthy" : "degraded",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    mongodb: mongoState === 1 ? "connected" : "disconnected",
  });
});

// ── Prometheus Metrics Endpoint ──
app.get("/metrics", metricsEndpoint);

// ── Start Server ──
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🔑 Auth Service running on port ${PORT}`);
});

// ── Graceful Shutdown ──
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down auth-service...`);
  mongoose.connection.close(false).then(() => {
    console.log("✅ MongoDB connection closed");
    process.exit(0);
  }).catch((err) => {
    console.error("❌ Error closing MongoDB:", err);
    process.exit(1);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
