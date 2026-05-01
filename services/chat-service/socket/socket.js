const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Message = require("../models/Message");
const User = require("../models/User");
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
    // Allow both transports — Socket.IO handshakes via polling first,
    // then upgrades to WebSocket for persistent bidirectional channel.
    // The API Gateway proxy has been fixed to correctly forward both.
    transports: ["polling", "websocket"],
    allowUpgrades: true,
    // Aggressive keepalive to prevent Ngrok/proxy from killing idle connections
    pingTimeout: 30000,
    pingInterval: 10000,
    // Allow Engine.IO v3 clients (backward compat)
    allowEIO3: true,
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
    const origin = socket.handshake.headers.origin || socket.handshake.address;
    console.log(`🔐 Socket auth attempt from ${origin} — token: ${token ? token.substring(0, 20) + '...' : 'MISSING'}`);

    if (!token) {
      console.error(`❌ Socket rejected: token missing (from ${origin})`);
      return next(new Error("Authentication Error: Token missing"));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error(`❌ Socket rejected: JWT error — ${err.message} (from ${origin})`);
        return next(new Error("Authentication Error: Invalid or expired token"));
      }
      console.log(`✅ Socket auth passed for userId: ${decoded.userId}`);
      socket.userId = decoded.userId;
      next();
    });
  });

  io.on("connection", async (socket) => {
    const transport = socket.conn.transport.name;
    const userId = socket.userId;

    // Look up user name for human-readable logs
    let userName = userId;
    try {
      const userDoc = await User.findById(userId).select('name email');
      if (userDoc) {
        userName = `${userDoc.name} (${userDoc.email})`;
        socket.userName = userDoc.name; // cache for disconnect
      }
    } catch (_) {}

    console.log(`🟢 [ONLINE] "${socket.userName || userId}" is now online | socket: ${socket.id} | transport: ${transport}`);

    if (userId) {
      if (!userSocketMap[userId]) {
        userSocketMap[userId] = [];
      }
      userSocketMap[userId].push(socket.id);
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
            console.log(`📦 [DELIVERY] ${senders.length} queued message(s) marked delivered for "${socket.userName || userId}"`);

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
      console.log(`🏠 [JOIN ROOM] "${socket.userName || userId}" joined conversation room: ${room}`);
    });

    socket.on("typing", (room) => socket.in(room).emit("typing", room));
    socket.on("stop typing", (room) => socket.in(room).emit("stop typing", room));

    socket.on("disconnect", () => {
      const displayName = socket.userName || userId;
      console.log(`🔴 [OFFLINE] "${displayName}" went offline | socket: ${socket.id}`);
      if (userId && userSocketMap[userId]) {
        userSocketMap[userId] = userSocketMap[userId].filter((id) => id !== socket.id);

        if (userSocketMap[userId].length === 0) {
          delete userSocketMap[userId];
          console.log(`📊 [PRESENCE] Online users now: ${Object.keys(userSocketMap).length} | removed: "${displayName}"`);
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
