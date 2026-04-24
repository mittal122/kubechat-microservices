import 'package:dio/dio.dart';
import '../config/api_config.dart';
import '../models/conversation_model.dart';
import '../models/message_model.dart';
import '../models/user_model.dart';
import 'api_service.dart';

/// Chat service — handles conversation and message API calls.
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
  /// [page] starts at 1, [limit] defaults to 50 messages per page.
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

  /// Search users by name or email.
  static Future<List<UserModel>> searchUsers(String query) async {
    final response =
        await _dio.get(ApiConfig.searchUsers, queryParameters: {'query': query});
    return (response.data['users'] as List)
        .map((json) => UserModel.fromJson(json))
        .toList();
  }
}
