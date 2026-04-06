const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const { io, getReceiverSocketIds } = require("../socket/socket");

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

    // Prevent self-chatting
    if (senderId.toString() === receiverId) {
      return res.status(400).json({ message: "You cannot message yourself" });
    }

    // Validate receiver exists
    const receiverExists = await User.findById(receiverId);
    if (!receiverExists) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    // 1. Check if a conversation already exists between the two users
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });

    // 2. If it does not exist, create it
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId],
        lastMessage: text,
      });
    }

    // --- SOCKET.IO DETERMINISTIC DELIVERY ROUTING ---
    const receiverSocketIds = getReceiverSocketIds(receiverId);
    const isReceiverOnline = receiverSocketIds && receiverSocketIds.length > 0;

    // 3. Save the new message dynamically marking it Delivered if they are natively online
    const message = await Message.create({
      conversationId: conversation._id,
      senderId,
      receiverId,
      text,
      status: isReceiverOnline ? "delivered" : "sent",
      isSeen: false, // Legacy fallback
    });

    // 4. Update the conversation layout fields (if it existed, we need to overwrite the last message)
    if (conversation.lastMessage !== text) {
      conversation.lastMessage = text;
      conversation.lastMessageAt = Date.now();
      await conversation.save();
    }

    // --- SOCKET.IO BURSTING ---
    if (isReceiverOnline) {
      // Safely burst payload out to all active devices (phones, tablets, tabs)
      receiverSocketIds.forEach((socketId) => {
        io.to(socketId).emit("newMessage", message);
      });
    }

    res.status(201).json(message);
  } catch (error) {
    console.error("SendMessage error:", error.message);
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

    // Validate conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Security Check: Verify requesting user is a participant
    const isParticipant = conversation.participants.some(
      (pId) => pId.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ message: "Not authorized to view this chat" });
    }

    // Query messages by conversationId, which is fast thanks to the schema index we added
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

    // Validate conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Security Check: Verify requesting user is a participant
    const isParticipant = conversation.participants.some(
      (pId) => pId.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ message: "Not authorized to update this chat" });
    }

    // Identify the *other* user who sent the messages we are marking as seen
    const otherUserId = conversation.participants.find(
      (pId) => pId.toString() !== userId.toString()
    );

    // Update all messages in this conversation where receiver === me AND status !== seen
    await Message.updateMany(
      { conversationId, receiverId: userId, status: { $ne: "seen" } },
      { $set: { status: "seen", isSeen: true } }
    );

    // --- SOCKET.IO REAL-TIME READ RECEIPT DELIVERY ---
    if (otherUserId) {
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
