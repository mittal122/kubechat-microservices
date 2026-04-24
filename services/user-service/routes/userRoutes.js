const express = require("express");
const router = express.Router();
const { getAllUsers, searchUsers } = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

// GET /api/users/search?query=xyz (must come before /)
router.get("/search", protect, searchUsers);

// GET /api/users
router.get("/", protect, getAllUsers);

module.exports = router;
