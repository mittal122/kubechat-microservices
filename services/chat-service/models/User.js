const mongoose = require("mongoose");

// Read-only User model reference for chat-service
// Needed for populate("participants", "name email") in conversations
const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    password: { type: String, select: false },
    refreshToken: { type: String },
    isOnline: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.index({ name: "text", email: "text" });

const User = mongoose.model("User", userSchema);

module.exports = User;
