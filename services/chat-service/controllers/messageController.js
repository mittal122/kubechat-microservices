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
    const { text, conversationId } = req.body;
    const { receiverId } = req.params;
    const senderId = req.user._id;

    if (!text) {
      return res.status(400).json({ message: "Text content is required" });
    }

    let conversation;
    let isGroupMessage = false;

    // Check if sending to a group (receiverId is actually a conversationId)
    if (conversationId) {
      conversation = await Conversation.findById(conversationId)
        .populate("participants", "name");
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      isGroupMessage = conversation.isGroup;
    } else {
      // 1-to-1 message
      if (senderId.toString() === receiverId) {
        return res.status(400).json({ message: "You cannot message yourself" });
      }
      const receiverExists = await User.findById(receiverId);
      if (!receiverExists) {
        return res.status(404).json({ message: "Receiver not found" });
      }
      conversation = await Conversation.findOne({
        participants: { $all: [senderId, receiverId] },
        isGroup: false,
      });
      if (!conversation) {
        conversation = await Conversation.create({
          participants: [senderId, receiverId],
          lastMessage: text,
        });
      }
    }

    const io = getIO();
    const senderName = req.user.name;

    if (isGroupMessage) {
      // Group message — no single receiverId, send to all participants except sender
      const message = await Message.create({
        conversationId: conversation._id,
        senderId,
        receiverId: senderId, // placeholder for group messages
        text,
        status: "delivered",
        isSeen: false,
        isGroup: true,
      });

      conversation.lastMessage = text;
      conversation.lastMessageAt = Date.now();
      await conversation.save();

      const messageJSON = message.toJSON();

      // Broadcast to ALL group members (except sender)
      if (io) {
        conversation.participants.forEach((participant) => {
          if (participant._id.toString() !== senderId.toString()) {
            const socketIds = getReceiverSocketIds(participant._id.toString());
            if (socketIds && socketIds.length > 0) {
              socketIds.forEach((sid) => io.to(sid).emit("newMessage", messageJSON));
            }
          }
        });
      }

      console.log(`👥 [GROUP MSG] "${senderName}" → "${conversation.groupName}": "${text.substring(0, 60)}"`);
      messagesSentTotal.inc({ status: "success" });
      return res.status(201).json(message);
    }

    // 1-to-1 message
    const receiverUser = await User.findById(receiverId);
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

    const messageJSON = message.toJSON();

    if (isReceiverOnline && io) {
      console.log(`📤 [MESSAGE SENT] "${senderName}" → "${receiverUser?.name}": "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"  (delivered in real-time)`);
      receiverSocketIds.forEach((socketId) => {
        io.to(socketId).emit("newMessage", messageJSON);
      });
    } else {
      console.log(`📬 [MESSAGE STORED] "${senderName}" → "${receiverUser?.name}": "${text.substring(0, 60)}" (receiver offline, queued)`);
    }

    messagesSentTotal.inc({ status: "success" });
    res.status(201).json(message);
  } catch (error) {
    console.error(`❌ [MESSAGE ERROR] ${error.message}`);
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

    // Look up both user names for the log
    const [reader, sender] = await Promise.all([
      User.findById(userId).select('name'),
      otherUserId ? User.findById(otherUserId).select('name') : null,
    ]);
    console.log(`👁️  [MESSAGES SEEN] "${reader?.name}" read messages from "${sender?.name || 'unknown'}"`);

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
    console.error(`❌ [MARK SEEN ERROR] ${error.message}`);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Mark all sent messages in a conversation as delivered
// @route   PUT /api/messages/:conversationId/delivered
// @access  Private
const markMessagesDelivered = async (req, res) => {
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

    await Message.updateMany(
      { conversationId, receiverId: userId, status: "sent" },
      { $set: { status: "delivered" } }
    );

    res.status(200).json({ message: "Messages marked as delivered" });
  } catch (error) {
    console.error(`❌ [MARK DELIVERED ERROR] ${error.message}`);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { sendMessage, getMessages, markMessagesSeen, markMessagesDelivered };
