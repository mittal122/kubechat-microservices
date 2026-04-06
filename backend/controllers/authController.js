const jwt = require("jsonwebtoken");
const Joi = require("joi");
const User = require("../models/User");

// ─── Token Generation ───────────────────────────────────
const generateAccessToken = (userId, email) => {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET, {
    expiresIn: "15m",
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
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const user = await User.create({ name, email, password });

    // Generate both tokens
    const accessToken = generateAccessToken(user._id, user.email);
    const refreshToken = generateRefreshToken(user._id, user.email);

    // Save refresh token to DB
    await User.updateOne({ _id: user._id }, { $set: { refreshToken } });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Register error:", error.message);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(", ") });
    }

    res.status(500).json({ message: "Server error" });
  }
};

// ─── Login ───────────────────────────────────────────────
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate both tokens
    const accessToken = generateAccessToken(user._id, user.email);
    const refreshToken = generateRefreshToken(user._id, user.email);

    // Save refresh token to DB
    await User.updateOne({ _id: user._id }, { $set: { refreshToken } });

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Refresh Token ───────────────────────────────────────
// @route   POST /api/auth/refresh
// @access  Public
const refreshTokenHandler = async (req, res) => {
  try {
    const { error } = refreshSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { refreshToken } = req.body;

    // Verify the refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    // Find user and check if the refresh token matches what's stored in DB
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Refresh token does not match" });
    }

    // Generate a new access token
    const newAccessToken = generateAccessToken(user._id, user.email);

    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Refresh token error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Logout ──────────────────────────────────────────────
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = async (req, res) => {
  try {
    // Clear refresh token from DB
    await User.updateOne({ _id: req.user._id }, { $set: { refreshToken: null } });

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Get Me ──────────────────────────────────────────────
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    res.status(200).json({
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      createdAt: req.user.createdAt,
    });
  } catch (error) {
    console.error("GetMe error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { registerUser, loginUser, refreshTokenHandler, logoutUser, getMe };
