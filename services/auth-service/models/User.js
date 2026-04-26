const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

/**
 * Generate a unique 7-character connect code in format: XXX-XXXX
 * Uses crypto.randomBytes for cryptographic randomness.
 */
function generateConnectCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 to avoid confusion
  const bytes = crypto.randomBytes(7);
  let code = "";
  for (let i = 0; i < 7; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code.slice(0, 3) + "-" + code.slice(3);
}

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
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    connectCode: {
      type: String,
      unique: true,
      index: true,
    },
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Add compound text index for scalable search
userSchema.index({ name: "text", email: "text" });

// Generate connect code before saving (only on new documents)
userSchema.pre("save", async function () {
  // Generate connect code for new users
  if (this.isNew && !this.connectCode) {
    let code;
    let exists = true;
    // Retry loop to guarantee uniqueness
    while (exists) {
      code = generateConnectCode();
      const found = await mongoose.model("User").findOne({ connectCode: code });
      exists = !!found;
    }
    this.connectCode = code;
  }

  // Hash password
  if (!this.isModified("password")) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with stored hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
