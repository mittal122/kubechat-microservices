const Conversation = require("../models/Conversation");

// @desc    Fetch all active chats/conversations for the logged in user
// @route   GET /api/conversations
// @access  Private
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name email")
      .sort({ lastMessageAt: -1 });

    const formattedConversations = conversations.map((convo) => {
      const plainConvo = convo.toObject();
      plainConvo.otherUser = plainConvo.participants.find(
        (p) => p._id.toString() !== userId.toString()
      );
      delete plainConvo.participants;
      return plainConvo;
    });

    res.status(200).json(formattedConversations);
  } catch (error) {
    console.error("GetConversations error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getConversations };
