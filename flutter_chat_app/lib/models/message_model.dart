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

  /// Safely extract a string from a field that could be:
  ///  - A plain string (from HTTP res.json → Mongoose toJSON)
  ///  - A Map with $oid key (from raw Socket.IO emit without toJSON)
  ///  - An ObjectId object (toString gives the hex string)
  static String _extractId(dynamic value) {
    if (value == null) return '';
    if (value is String) return value;
    if (value is Map) {
      // MongoDB extended JSON format: {"$oid": "664f..."}
      return value['\$oid']?.toString() ?? value.values.first?.toString() ?? '';
    }
    // Fallback: call toString() which works for ObjectId types
    return value.toString();
  }

  factory MessageModel.fromJson(Map<String, dynamic> json) {
    return MessageModel(
      id: _extractId(json['_id']),
      conversationId: _extractId(json['conversationId']),
      senderId: _extractId(json['senderId']),
      receiverId: _extractId(json['receiverId']),
      text: json['text']?.toString() ?? '',
      status: json['status']?.toString() ?? 'sent',
      isSeen: json['isSeen'] == true,
      createdAt: json['createdAt']?.toString() ?? DateTime.now().toIso8601String(),
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
