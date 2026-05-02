import 'user_model.dart';

/// Data model for a Conversation (supports both 1-to-1 and Group chats).
class ConversationModel {
  final String? id;
  final UserModel otherUser;
  final String? lastMessage;
  final String? lastMessageAt;
  final bool isNew;
  final bool isGroup;
  final List<UserModel> groupMembers;
  int unreadCount;

  ConversationModel({
    this.id,
    required this.otherUser,
    this.lastMessage,
    this.lastMessageAt,
    this.isNew = false,
    this.isGroup = false,
    this.groupMembers = const [],
    this.unreadCount = 0,
  });

  factory ConversationModel.fromJson(Map<String, dynamic> json) {
    final otherUserJson = json['otherUser'] as Map<String, dynamic>;
    final isGroup = otherUserJson['isGroup'] == true;

    List<UserModel> members = [];
    if (isGroup && otherUserJson['members'] != null) {
      members = (otherUserJson['members'] as List)
          .map((m) => UserModel.fromJson(m as Map<String, dynamic>))
          .toList();
    }

    return ConversationModel(
      id: json['_id'] as String?,
      otherUser: UserModel.fromGroupOrUser(otherUserJson),
      lastMessage: json['lastMessage'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
      unreadCount: json['unreadCount'] as int? ?? 0,
      isGroup: isGroup,
      groupMembers: members,
    );
  }

  /// Create a temporary conversation for a new 1-to-1 chat.
  factory ConversationModel.newChat(UserModel user) {
    return ConversationModel(
      otherUser: user,
      isNew: true,
    );
  }
}
