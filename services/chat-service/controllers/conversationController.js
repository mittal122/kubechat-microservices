const Conversation = require("../models/Conversation");
const User = require("../models/User");

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

      if (plainConvo.isGroup) {
        // For group chats: return groupName as the "otherUser" display
        plainConvo.otherUser = {
          _id: plainConvo._id,
          name: plainConvo.groupName || "Group",
          email: "",
          isGroup: true,
          members: plainConvo.participants,
        };
      } else {
        // For 1-to-1 chats: return the other participant as otherUser
        plainConvo.otherUser = plainConvo.participants.find(
          (p) => p._id.toString() !== userId.toString()
        );
      }

      delete plainConvo.participants;
      return plainConvo;
    });

    res.status(200).json(formattedConversations);
  } catch (error) {
    console.error("GetConversations error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Create a new group conversation
// @route   POST /api/conversations/group
// @access  Private
const createGroup = async (req, res) => {
  try {
    const { groupName, memberIds } = req.body;
    const adminId = req.user._id;
    const MAX = Conversation.MAX_GROUP_MEMBERS;

    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ message: "Select at least 1 member" });
    }

    // Build unique participant list: admin + members
    const uniqueIds = [...new Set([adminId.toString(), ...memberIds])];

    if (uniqueIds.length > MAX) {
      return res.status(400).json({
        message: `Group cannot have more than ${MAX} members (including you)`,
      });
    }

    // Validate all members exist
    const users = await User.find({ _id: { $in: uniqueIds } }).select("name");
    if (users.length !== uniqueIds.length) {
      return res.status(400).json({ message: "One or more users not found" });
    }

    const group = await Conversation.create({
      participants: uniqueIds,
      isGroup: true,
      groupName: groupName.trim(),
      groupAdmin: adminId,
      lastMessage: `${req.user.name} created the group`,
      lastMessageAt: Date.now(),
    });

    const populated = await Conversation.findById(group._id)
      .populate("participants", "name email");

    const result = populated.toObject();
    result.otherUser = {
      _id: result._id,
      name: result.groupName,
      email: "",
      isGroup: true,
      members: result.participants,
    };
    delete result.participants;

    console.log(`👥 [GROUP CREATED] "${groupName}" by "${req.user.name}" (${uniqueIds.length} members)`);

    res.status(201).json(result);
  } catch (error) {
    console.error("CreateGroup error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get group details (members list)
// @route   GET /api/conversations/group/:groupId
// @access  Private
const getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Conversation.findById(groupId)
      .populate("participants", "name email isOnline lastActive")
      .populate("groupAdmin", "name");

    if (!group || !group.isGroup) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.participants.some(
      (p) => p._id.toString() === userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    res.status(200).json(group);
  } catch (error) {
    console.error("GetGroupDetails error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getConversations, createGroup, getGroupDetails };
