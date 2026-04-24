const mongoose = require("mongoose");

// Read-only User model for user-service (no password hashing needed)
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a name"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      select: false,
    },
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Text index for search
userSchema.index({ name: "text", email: "text" });

const User = mongoose.model("User", userSchema);

module.exports = User;
