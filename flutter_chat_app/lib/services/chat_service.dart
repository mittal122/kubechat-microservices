import 'package:dio/dio.dart';
import '../config/api_config.dart';
import '../models/conversation_model.dart';
import '../models/message_model.dart';
import '../models/user_model.dart';
import 'api_service.dart';

/// Chat service — handles conversation, message, and user discovery API calls.
class ChatService {
  static Dio get _dio => ApiService.dio;

  /// Fetch all conversations for the current user.
  static Future<List<ConversationModel>> getConversations() async {
    final response = await _dio.get(ApiConfig.conversations);
    return (response.data as List)
        .map((json) => ConversationModel.fromJson(json))
        .toList();
  }

  /// Fetch message history for a conversation with pagination.
  static Future<List<MessageModel>> getMessages(
    String conversationId, {
    int page = 1,
    int limit = 50,
  }) async {
    final response = await _dio.get(
      '${ApiConfig.messages}/$conversationId',
      queryParameters: {'page': page, 'limit': limit},
    );
    return (response.data as List)
        .map((json) => MessageModel.fromJson(json))
        .toList();
  }

  /// Send a message to a receiver.
  static Future<MessageModel> sendMessage(
      String receiverId, String text) async {
    final response = await _dio.post(
      '${ApiConfig.messages}/$receiverId',
      data: {'text': text},
    );
    return MessageModel.fromJson(response.data);
  }

  /// Mark all messages in a conversation as seen.
  static Future<void> markMessagesSeen(String conversationId) async {
    await _dio.put('${ApiConfig.messages}/$conversationId/seen');
  }

  /// Mark all messages in a conversation as delivered (double tick).
  static Future<void> markMessagesDelivered(String conversationId) async {
    await _dio.put('${ApiConfig.messages}/$conversationId/delivered');
  }

  /// Create a new group conversation.
  static Future<ConversationModel> createGroup({
    required String groupName,
    required List<String> memberIds,
  }) async {
    final response = await _dio.post(
      '${ApiConfig.conversations}/group',
      data: {'groupName': groupName, 'memberIds': memberIds},
    );
    return ConversationModel.fromJson(response.data);
  }

  /// Get group details (members list).
  static Future<Map<String, dynamic>> getGroupDetails(String groupId) async {
    final response = await _dio.get('${ApiConfig.conversations}/group/$groupId');
    return response.data;
  }

  /// Update own presence (online/offline).
  static Future<void> updatePresence(bool isOnline) async {
    try {
      await _dio.put(ApiConfig.presence, data: {'isOnline': isOnline});
    } catch (e) {
      // Silently fail if token is expired during logout
    }
  }

  /// Get presence for specific users.
  static Future<Map<String, dynamic>> getPresence(List<String> userIds) async {
    if (userIds.isEmpty) return {};
    final response = await _dio.post(ApiConfig.presence, data: {'userIds': userIds});
    
    // Convert to map of id -> { isOnline, lastActive }
    final map = <String, dynamic>{};
    for (var u in response.data) {
      map[u['_id']] = {
        'isOnline': u['isOnline'] ?? false,
        'lastActive': u['lastActive'],
      };
    }
    return map;
  }

  /// Find a user by their connect code (privacy-first discovery).
  static Future<UserModel?> findUserByCode(String code) async {
    try {
      final response = await _dio.get('${ApiConfig.findByCode}/$code');
      if (response.data != null && response.data['user'] != null) {
        return UserModel.fromJson(response.data['user']);
      }
      return null;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404 || e.response?.statusCode == 400) {
        return null; // Not found or own code
      }
      rethrow;
    }
  }

  /// Search users by name or email (legacy — kept for backward compat).
  static Future<List<UserModel>> searchUsers(String query) async {
    final response =
        await _dio.get(ApiConfig.searchUsers, queryParameters: {'query': query});
    return (response.data['users'] as List)
        .map((json) => UserModel.fromJson(json))
        .toList();
  }
}
