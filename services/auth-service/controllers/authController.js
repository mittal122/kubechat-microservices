const jwt = require("jsonwebtoken");
const Joi = require("joi");
const User = require("../models/User");
const { loginAttemptsTotal, registrationsTotal } = require("../config/metrics");

// ─── Token Generation ───────────────────────────────────
const generateAccessToken = (userId, email) => {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

const generateRefreshToken = (userId, email) => {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// ─── Joi Schemas ─────────────────────────────────────────
const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

// ─── Register ────────────────────────────────────────────
const registerUser = async (req, res) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) {
      registrationsTotal.inc({ status: "validation_failed" });
      console.warn(`🔴 [REGISTER FAILED] Validation error for ${req.body.email}: ${error.details[0].message}`);
      return res.status(400).json({ message: error.details[0].message });
    }

    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      registrationsTotal.inc({ status: "duplicate" });
      console.warn(`⚠️  [REGISTER FAILED] ${email} already exists`);
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const user = await User.create({ name, email, password });

    const accessToken = generateAccessToken(user._id, user.email);
    const refreshToken = generateRefreshToken(user._id, user.email);

    await User.updateOne({ _id: user._id }, { $set: { refreshToken } });

    registrationsTotal.inc({ status: "success" });
    console.log(`🆕 [REGISTER] New user "${user.name}" (${user.email}) registered successfully | id: ${user._id}`);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      connectCode: user.connectCode,
      createdAt: user.createdAt,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error(`❌ [REGISTER ERROR] ${error.message}`);
    registrationsTotal.inc({ status: "error" });

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(", ") });
    }

    res.status(500).json({ message: "Server error" });
  }
};

// ─── Login ───────────────────────────────────────────────
const loginUser = async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) {
      loginAttemptsTotal.inc({ status: "validation_failed" });
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    if (!user) {
      loginAttemptsTotal.inc({ status: "failed" });
      console.warn(`🔴 [LOGIN FAILED] No account found for: ${email}`);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      loginAttemptsTotal.inc({ status: "failed" });
      console.warn(`🔴 [LOGIN FAILED] Wrong password for: ${user.name} (${email})`);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = generateAccessToken(user._id, user.email);
    const refreshToken = generateRefreshToken(user._id, user.email);

    await User.updateOne({ _id: user._id }, { $set: { refreshToken } });

    loginAttemptsTotal.inc({ status: "success" });
    console.log(`✅ [LOGIN] "${user.name}" (${user.email}) logged in successfully | id: ${user._id}`);

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      connectCode: user.connectCode,
      createdAt: user.createdAt,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error(`❌ [LOGIN ERROR] ${error.message}`);
    loginAttemptsTotal.inc({ status: "error" });
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Refresh Token ───────────────────────────────────────
const refreshTokenHandler = async (req, res) => {
  try {
    const { error } = refreshSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { refreshToken } = req.body;

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (err) {
      console.warn(`⚠️  [TOKEN REFRESH FAILED] Invalid/expired refresh token`);
      return res.status(401).json({ message: "Invalid or expired refresh token", expired: true });
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.refreshToken !== refreshToken) {
      console.warn(`⚠️  [TOKEN REFRESH FAILED] Token mismatch for ${user.name}`);
      return res.status(401).json({ message: "Refresh token does not match" });
    }

    const newAccessToken = generateAccessToken(user._id, user.email);
    console.log(`🔄 [TOKEN REFRESH] "${user.name}" (${user.email}) refreshed their access token`);

    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error(`❌ [TOKEN REFRESH ERROR] ${error.message}`);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Logout ──────────────────────────────────────────────
const logoutUser = async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $set: { refreshToken: null } });
    console.log(`👋 [LOGOUT] "${req.user.name}" (${req.user.email}) logged out`);
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error(`❌ [LOGOUT ERROR] ${error.message}`);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Get Me ──────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    res.status(200).json({
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      connectCode: req.user.connectCode,
      createdAt: req.user.createdAt,
    });
  } catch (error) {
    console.error("GetMe error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { registerUser, loginUser, refreshTokenHandler, logoutUser, getMe };
