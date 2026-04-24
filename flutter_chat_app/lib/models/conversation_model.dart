import 'user_model.dart';

/// Data model for a Conversation.
/// Maps to the backend's formatted conversation response from getConversations.
class ConversationModel {
  final String? id;
  final UserModel otherUser;
  final String? lastMessage;
  final String? lastMessageAt;
  final bool isNew;
  int unreadCount;

  ConversationModel({
    this.id,
    required this.otherUser,
    this.lastMessage,
    this.lastMessageAt,
    this.isNew = false,
    this.unreadCount = 0,
  });

  factory ConversationModel.fromJson(Map<String, dynamic> json) {
    return ConversationModel(
      id: json['_id'] as String?,
      otherUser: UserModel.fromJson(json['otherUser'] as Map<String, dynamic>),
      lastMessage: json['lastMessage'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
      unreadCount: json['unreadCount'] as int? ?? 0,
    );
  }

  /// Create a temporary conversation for a new chat (before first message).
  factory ConversationModel.newChat(UserModel user) {
    return ConversationModel(
      otherUser: user,
      isNew: true,
    );
  }
}
