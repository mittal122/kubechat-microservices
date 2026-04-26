const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const { getIO, getReceiverSocketIds } = require("../socket/socket");
const { messagesSentTotal } = require("../config/metrics");

// @desc    Send a message and create/update Conversation
// @route   POST /api/messages/:receiverId
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const { receiverId } = req.params;
    const senderId = req.user._id;

    if (!text) {
      return res.status(400).json({ message: "Text content is required" });
    }

    if (senderId.toString() === receiverId) {
      return res.status(400).json({ message: "You cannot message yourself" });
    }

    const receiverExists = await User.findById(receiverId);
    if (!receiverExists) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId],
        lastMessage: text,
      });
    }

    const io = getIO();
    const receiverSocketIds = getReceiverSocketIds(receiverId);
    const isReceiverOnline = receiverSocketIds && receiverSocketIds.length > 0;

    const message = await Message.create({
      conversationId: conversation._id,
      senderId,
      receiverId,
      text,
      status: isReceiverOnline ? "delivered" : "sent",
      isSeen: false,
    });

    if (conversation.lastMessage !== text) {
      conversation.lastMessage = text;
      conversation.lastMessageAt = Date.now();
      await conversation.save();
    }

    if (isReceiverOnline && io) {
      console.log(`📤 Emitting newMessage to ${receiverSocketIds.length} socket(s) of user ${receiverId}`);
      receiverSocketIds.forEach((socketId) => {
        console.log(`   → io.to(${socketId}).emit("newMessage")`);
        io.to(socketId).emit("newMessage", message);
      });
    } else {
      console.log(`📥 Message stored (receiver ${receiverId} offline, status: ${message.status})`);
    }

    messagesSentTotal.inc({ status: "success" });

    res.status(201).json(message);
  } catch (error) {
    console.error("SendMessage error:", error.message);
    messagesSentTotal.inc({ status: "error" });
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Fetch message history for a conversation
// @route   GET /api/messages/:conversationId
// @access  Private
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (pId) => pId.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ message: "Not authorized to view this chat" });
    }

    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.error("GetMessages error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Mark all unread messages in a conversation as seen
// @route   PUT /api/messages/:conversationId/seen
// @access  Private
const markMessagesSeen = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (pId) => pId.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ message: "Not authorized to update this chat" });
    }

    const otherUserId = conversation.participants.find(
      (pId) => pId.toString() !== userId.toString()
    );

    await Message.updateMany(
      { conversationId, receiverId: userId, status: { $ne: "seen" } },
      { $set: { status: "seen", isSeen: true } }
    );

    const io = getIO();
    if (otherUserId && io) {
      const senderSocketIds = getReceiverSocketIds(otherUserId.toString());
      if (senderSocketIds && senderSocketIds.length > 0) {
        senderSocketIds.forEach((socketId) => {
          io.to(socketId).emit("messagesSeen", { conversationId });
        });
      }
    }

    res.status(200).json({ message: "Messages marked as seen" });
  } catch (error) {
    console.error("MarkMessagesSeen error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { sendMessage, getMessages, markMessagesSeen };
