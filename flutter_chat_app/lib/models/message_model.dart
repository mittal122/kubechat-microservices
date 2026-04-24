/// Data model for a Message.
/// Maps to the backend's Message mongoose model.
///
/// Uses copyWith() for immutable state updates to ensure
/// Provider widget rebuilds detect changes correctly.
class MessageModel {
  final String id;
  final String conversationId;
  final String senderId;
  final String receiverId;
  final String text;
  String status; // 'sent', 'delivered', 'seen'
  bool isSeen;
  final String createdAt;

  MessageModel({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.receiverId,
    required this.text,
    required this.status,
    required this.isSeen,
    required this.createdAt,
  });

  factory MessageModel.fromJson(Map<String, dynamic> json) {
    return MessageModel(
      id: json['_id'] as String,
      conversationId: json['conversationId'] as String,
      senderId: json['senderId'] as String,
      receiverId: json['receiverId'] as String,
      text: json['text'] as String,
      status: json['status'] as String? ?? 'sent',
      isSeen: json['isSeen'] as bool? ?? false,
      createdAt: json['createdAt'] as String,
    );
  }

  /// Create a copy with updated fields — ensures Provider detects changes.
  MessageModel copyWith({
    String? status,
    bool? isSeen,
  }) {
    return MessageModel(
      id: id,
      conversationId: conversationId,
      senderId: senderId,
      receiverId: receiverId,
      text: text,
      status: status ?? this.status,
      isSeen: isSeen ?? this.isSeen,
      createdAt: createdAt,
    );
  }
}
