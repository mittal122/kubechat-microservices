const Conversation = require("../models/Conversation");

// @desc    Fetch all active chats/conversations for the logged in user
// @route   GET /api/conversations
// @access  Private
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch conversations where user is in the participants array
    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name email") // Populate other user data to display in list
      .sort({ lastMessageAt: -1 }); // DESC so newest chats bubble to the top

    // Filter out the requesting user from the populated participants response
    // to strictly deliver the "other user's" information seamlessly to the frontend
    const formattedConversations = conversations.map((convo) => {
      // Create a plain object to avoid mongoose document modification issues
      const plainConvo = convo.toObject();
      plainConvo.otherUser = plainConvo.participants.find(
        (p) => p._id.toString() !== userId.toString()
      );
      // Remove raw array to keep payload clean
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
