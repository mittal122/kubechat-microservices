const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Message = require("../models/Message");
const { activeWebsocketConnections } = require("../config/metrics");

// ── Redis Adapter for Multi-Pod Horizontal Scaling ──
let createAdapter, Redis;
try {
  createAdapter = require("@socket.io/redis-adapter").createAdapter;
  Redis = require("ioredis");
} catch (err) {
  console.warn("Redis adapter packages not found — running in single-process mode");
}

// ── User-Socket Tracking ──
const userSocketMap = {};

const getReceiverSocketIds = (receiverId) => {
  return userSocketMap[receiverId] || [];
};

let io;

const initSocket = (server) => {
  const corsOrigin = process.env.CORS_ORIGIN || "*";

  io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"],
    },
    // ── FIX: WebSocket-only + aggressive keepalive ──
    // Polling through Ngrok's reverse proxy buffers responses,
    // causing the "messages arrive only after disconnect" symptom.
    // WebSocket gives a persistent, unbuffered bidirectional channel.
    transports: ["websocket"],
    // Aggressive ping to keep Ngrok tunnel alive (it kills idle connections)
    pingTimeout: 30000,   // 30s before considering connection dead
    pingInterval: 10000,  // Ping every 10s to keep tunnel warm
  });

  // ── Attach Redis Adapter (if REDIS_URL is configured) ──
  if (process.env.REDIS_URL && createAdapter && Redis) {
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) => console.error("Redis Pub Client Error:", err));
    subClient.on("error", (err) => console.error("Redis Sub Client Error:", err));

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

  // ── Strict Security Authentication Middleware ──
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) return next(new Error("Authentication Error: Token missing"));

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error("Authentication Error: Invalid or expired token"));
      socket.userId = decoded.userId;
      next();
    });
  });

  io.on("connection", (socket) => {
    const transport = socket.conn.transport.name;
    console.log(`🟢 User connected: ${socket.id} (transport: ${transport})`);

    const userId = socket.userId;
    if (userId) {
      if (!userSocketMap[userId]) {
        userSocketMap[userId] = [];
      }
      userSocketMap[userId].push(socket.id);
      console.log(`   → Mapped userId ${userId} → [${userSocketMap[userId].join(', ')}]`);
    }

    // ── Update Prometheus Gauge ──
    activeWebsocketConnections.set(Object.keys(userSocketMap).length);

    // Broadcast online users
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // ── Automated Delivery System ──
    if (userId) {
      (async () => {
        try {
          const senders = await Message.distinct("senderId", { receiverId: userId, status: "sent" });
          if (senders.length > 0) {
            await Message.updateMany(
              { receiverId: userId, status: "sent" },
              { $set: { status: "delivered" } }
            );

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

    socket.on("join chat", (room) => {
      socket.join(room);
      console.log(`User ${userId} joined room: ${room}`);
    });

    socket.on("typing", (room) => socket.in(room).emit("typing", room));
    socket.on("stop typing", (room) => socket.in(room).emit("stop typing", room));

    socket.on("disconnect", () => {
      console.log("🔴 User disconnected:", socket.id);
      if (userId && userSocketMap[userId]) {
        userSocketMap[userId] = userSocketMap[userId].filter((id) => id !== socket.id);

        if (userSocketMap[userId].length === 0) {
          delete userSocketMap[userId];
        }

        // ── Update Prometheus Gauge ──
        activeWebsocketConnections.set(Object.keys(userSocketMap).length);

        io.emit("getOnlineUsers", Object.keys(userSocketMap));
      }
    });
  });
};

const getIO = () => io;

module.exports = { initSocket, getIO, getReceiverSocketIds };
