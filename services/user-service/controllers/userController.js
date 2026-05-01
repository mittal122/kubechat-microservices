const Joi = require("joi");
const User = require("../models/User");
const { userSearchTotal } = require("../config/metrics");

// @desc    Get all users except the logged-in user
// @route   GET /api/users
// @access  Private
const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { _id: { $ne: req.user._id } };

    const users = await User.find(query)
      .select("name email connectCode isOnline lastActive")
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    res.status(200).json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("GetAllUsers error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Joi schema for connect code lookup
const codeSchema = Joi.object({
  code: Joi.string().min(3).max(10).required(),
});

// @desc    Find a user by their connect code
// @route   GET /api/users/code/:code
// @access  Private
const findByCode = async (req, res) => {
  try {
    const code = req.params.code;

    if (!code || code.length < 3) {
      return res.status(400).json({ message: "Invalid connect code" });
    }

    // Normalize: uppercase and ensure dash format
    const normalizedCode = code.toUpperCase().trim();

    const user = await User.findOne({ connectCode: normalizedCode })
      .select("name email connectCode");

    if (!user) {
      return res.status(404).json({ message: "No user found with this code" });
    }

    // Don't allow looking up yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "This is your own connect code" });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("FindByCode error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Joi schema for search query
const searchSchema = Joi.object({
  query: Joi.string().min(1).max(100).required(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(50).optional(),
});

// @desc    Search users by name or email
// @route   GET /api/users/search?query=xyz
// @access  Private
const searchUsers = async (req, res) => {
  try {
    const { error } = searchSchema.validate(req.query);
    if (error) {
      userSearchTotal.inc({ status: "validation_failed" });
      return res.status(400).json({ message: error.details[0].message });
    }

    const { query } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let usersQuery;
    let total;

    if (query.length < 3) {
      const searchQuery = {
        $and: [
          { _id: { $ne: req.user._id } },
          {
            $or: [
              { name: { $regex: query, $options: "i" } },
              { email: { $regex: query, $options: "i" } },
            ],
          },
        ],
      };

      usersQuery = User.find(searchQuery).select("name email connectCode isOnline lastActive").sort({ name: 1 });
      total = await User.countDocuments(searchQuery);
    } else {
      const searchQuery = {
        $text: { $search: query },
        _id: { $ne: req.user._id },
      };

      usersQuery = User.find(searchQuery, { score: { $meta: "textScore" } })
        .select("name email connectCode isOnline lastActive")
        .sort({ score: { $meta: "textScore" } });
      total = await User.countDocuments(searchQuery);
    }

    const users = await usersQuery.skip(skip).limit(limit);

    userSearchTotal.inc({ status: "success" });

    res.status(200).json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("SearchUsers error:", error.message);
    userSearchTotal.inc({ status: "error" });
    res.status(500).json({ message: "Server error" });
  }
};

// Joi schema for presence
const presenceSchema = Joi.object({
  isOnline: Joi.boolean().required()
});

// @desc    Update user presence
// @route   PUT /api/users/presence
// @access  Private
const updatePresence = async (req, res) => {
  try {
    const { error } = presenceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { isOnline } = req.body;
    
    await User.findByIdAndUpdate(req.user._id, {
      isOnline,
      lastActive: Date.now()
    });

    res.status(200).json({ message: "Presence updated" });
  } catch (error) {
    console.error("UpdatePresence error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get presence of specific users (for polling)
// @route   POST /api/users/presence
// @access  Private
const getPresence = async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ message: "userIds array is required" });
    }

    const users = await User.find({ _id: { $in: userIds } })
      .select("isOnline lastActive");

    res.status(200).json(users);
  } catch (error) {
    console.error("GetPresence error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getAllUsers, searchUsers, findByCode, updatePresence, getPresence };
