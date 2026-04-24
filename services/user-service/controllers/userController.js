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
      .select("name email")
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

      usersQuery = User.find(searchQuery).select("name email").sort({ name: 1 });
      total = await User.countDocuments(searchQuery);
    } else {
      const searchQuery = {
        $text: { $search: query },
        _id: { $ne: req.user._id },
      };

      usersQuery = User.find(searchQuery, { score: { $meta: "textScore" } })
        .select("name email")
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

module.exports = { getAllUsers, searchUsers };
