const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const {
  registerUser,
  loginUser,
  refreshTokenHandler,
  logoutUser,
  getMe,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Rate Limiter for Login (Max 5 attempts per minute)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: "Too many login attempts from this IP, please try again after a minute" },
});

// POST /api/auth/register
router.post("/register", registerUser);

// POST /api/auth/login
router.post("/login", loginLimiter, loginUser);

// POST /api/auth/refresh
router.post("/refresh", refreshTokenHandler);

// POST /api/auth/logout (protected)
router.post("/logout", protect, logoutUser);

// GET /api/auth/me (protected)
router.get("/me", protect, getMe);

module.exports = router;
