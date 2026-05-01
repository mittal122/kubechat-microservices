const express = require("express");
const router = express.Router();
const { getAllUsers, searchUsers, findByCode, updatePresence, getPresence } = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

// GET /api/users/code/:code (find user by connect code)
router.get("/code/:code", protect, findByCode);

// GET /api/users/search?query=xyz (must come before /)
router.get("/search", protect, searchUsers);

// GET /api/users
router.get("/", protect, getAllUsers);

// PUT /api/users/presence (update my presence)
router.put("/presence", protect, updatePresence);

// POST /api/users/presence (get presence for multiple users)
router.post("/presence", protect, getPresence);

module.exports = router;
