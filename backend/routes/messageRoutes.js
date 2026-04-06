const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { sendMessage, getMessages, markMessagesSeen } = require("../controllers/messageController");

const router = express.Router();

router.post("/:receiverId", protect, sendMessage);
router.get("/:conversationId", protect, getMessages);
router.put("/:conversationId/seen", protect, markMessagesSeen);

module.exports = router;
