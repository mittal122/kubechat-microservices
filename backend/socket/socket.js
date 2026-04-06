const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const Message = require("../models/Message"); // Dynamically calculate delivered states

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Will lock this down later for production
    methods: ["GET", "POST"],
  },
});

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
