const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const Message = require("../models/Message"); // Dynamically calculate delivered states

// ── Redis Adapter for Multi-Pod Horizontal Scaling ──
// When REDIS_URL is set, Socket.IO broadcasts flow through Redis pub/sub,
// allowing events to reach sockets connected to ANY pod in the cluster.
// When REDIS_URL is absent, falls back to single-process mode (local dev).
let createAdapter, Redis;
try {
  createAdapter = require("@socket.io/redis-adapter").createAdapter;
  Redis = require("ioredis");
} catch (err) {
  // Graceful fallback if Redis packages are not installed
  console.warn("Redis adapter packages not found — running in single-process mode");
}

const app = express();
const server = http.createServer(app);

// ── CORS Configuration ──
// Production: set CORS_ORIGIN to your domain (e.g., "https://chat.yourdomain.com")
// Development: defaults to "*" for local testing
const corsOrigin = process.env.CORS_ORIGIN || "*";

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
  },
});

// ── Attach Redis Adapter (if REDIS_URL is configured) ──
if (process.env.REDIS_URL && createAdapter && Redis) {
  const pubClient = new Redis(process.env.REDIS_URL);
  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => console.error("Redis Pub Client Error:", err));
  subClient.on("error", (err) => console.error("Redis Sub Client Error:", err));

  // Once both clients are ready, mount the adapter
  Promise.all([
    new Promise((resolve) => pubClient.on("ready", resolve)),
    new Promise((resolve) => subClient.on("ready", resolve)),
  ]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log("✅ Socket.IO Redis Adapter connected — multi-pod broadcasting enabled");
  }).catch((err) => {
    console.error("❌ Redis Adapter connection failed:", err);
  });
} else {
  console.log("ℹ️  Socket.IO running in single-process mode (no REDIS_URL)");
}

// ── User-Socket Tracking ──
// LOCAL in-memory map — each pod tracks its OWN connected sockets.
// The Redis adapter handles cross-pod event delivery automatically;
// when io.to(socketId).emit() is called, the adapter routes the event
// to whichever pod owns that socket. This keeps the map simple and fast.
// Format: { "userId": ["socketId1", "socketId2"] }
const userSocketMap = {};

const getReceiverSocketIds = (receiverId) => {
  return userSocketMap[receiverId] || [];
};

// ── Strict Security Authentication Middleware ──
io.use((socket, next) => {
  // Support both handshake auth payload or query parameters
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) return next(new Error("Authentication Error: Token missing"));

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Authentication Error: Invalid or expired token"));
    // Mount the securely decoded ID onto the socket session natively
    socket.userId = decoded.userId;
    next();
  });
});

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // Use the verified userId from the middleware
  const userId = socket.userId;
  if (userId) {
    if (!userSocketMap[userId]) {
      userSocketMap[userId] = []; // Initialize array if first time
    }
    userSocketMap[userId].push(socket.id);
  }

  // Broadcast to all clients exactly who is online
  // With Redis adapter, this broadcast reaches ALL pods automatically
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // --- AUTOMATED DELIVERY SYSTEM ---
  // If Alice texted Bob while Bob was offline, her messages are "sent".
  // Now that Bob is online, we instantly transition them to "delivered"
  if (userId) {
    (async () => {
      try {
        const senders = await Message.distinct("senderId", { receiverId: userId, status: "sent" });
        if (senders.length > 0) {
          await Message.updateMany(
            { receiverId: userId, status: "sent" },
            { $set: { status: "delivered" } }
          );

          // Burst delivery ticks live back to the original senders' phones magically
          // With Redis adapter, io.to() automatically routes to the correct pod
          senders.forEach((senderId) => {
            const senderSockets = getReceiverSocketIds(senderId.toString());
            senderSockets.forEach((sId) => {
              io.to(sId).emit("messagesDelivered", { receiverId: userId });
            });
          });
        }
      } catch (err) {
        console.error("Delivery Status Migration Error:", err);
      }
    })();
  }

  // Handle specific conversation room joining for typing indicators etc.
  socket.on("join chat", (room) => {
    socket.join(room);
    console.log(`User ${userId} joined room: ${room}`);
  });

  socket.on("typing", (room) => socket.in(room).emit("typing", room));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing", room));

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    if (userId && userSocketMap[userId]) {
      // Filter the exact socket ID out without blowing away the user's other open devices
      userSocketMap[userId] = userSocketMap[userId].filter((id) => id !== socket.id);

      // If array is completely empty, the user officially went natively Offline
      if (userSocketMap[userId].length === 0) {
        delete userSocketMap[userId];
      }

      // Broadcast active user IDs to everyone
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    }
  });
});

module.exports = { app, io, server, getReceiverSocketIds };
