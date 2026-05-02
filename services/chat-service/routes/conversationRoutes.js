const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getConversations, createGroup, getGroupDetails } = require("../controllers/conversationController");

const router = express.Router();

router.get("/", protect, getConversations);
router.post("/group", protect, createGroup);
router.get("/group/:groupId", protect, getGroupDetails);

module.exports = router;
