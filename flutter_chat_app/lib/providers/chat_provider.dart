import 'package:flutter/material.dart';
import '../models/conversation_model.dart';
import '../models/message_model.dart';
import '../services/chat_service.dart';

/// Chat state management — manages conversations and messages.
class ChatProvider extends ChangeNotifier {
  List<ConversationModel> _conversations = [];
  ConversationModel? _activeConversation;
  List<MessageModel> _messages = [];
  bool _loadingMessages = false;
  String? _error; // Latest error message for UI display

  List<ConversationModel> get conversations => _conversations;
  ConversationModel? get activeConversation => _activeConversation;
  List<MessageModel> get messages => _messages;
  bool get loadingMessages => _loadingMessages;
  String? get error => _error;

  /// Clear the error (call after showing SnackBar).
  void clearError() {
    _error = null;
    notifyListeners();
  }

  int get totalUnread =>
      _conversations.fold(0, (sum, c) => sum + c.unreadCount);

  /// Fetch all conversations.
  Future<void> loadConversations() async {
    try {
      _conversations = await ChatService.getConversations();
      notifyListeners();
    } catch (e) {
      _error = 'Failed to load conversations. Check your connection.';
      debugPrint('Failed to load conversations: $e');
      notifyListeners();
    }
  }

  /// Set the active conversation and load its messages.
  Future<void> setActiveConversation(ConversationModel? conv) async {
    _activeConversation = conv;

    if (conv != null && !conv.isNew && conv.id != null) {
      // Clear unread count
      final idx = _conversations.indexWhere((c) => c.id == conv.id);
      if (idx != -1) {
        _conversations[idx].unreadCount = 0;
      }

      // Load messages
      _loadingMessages = true;
      notifyListeners();

      try {
        _messages = await ChatService.getMessages(conv.id!);
      } catch (e) {
        _error = 'Failed to load messages.';
        debugPrint('Failed to fetch messages: $e');
      } finally {
        _loadingMessages = false;
        notifyListeners();
      }
    } else {
      _messages = [];
      notifyListeners();
    }
  }

  /// Send a message.
  Future<void> sendMessage(String receiverId, String text) async {
    try {
      final message = await ChatService.sendMessage(receiverId, text);

      // Add to messages if not already there
      if (!_messages.any((m) => m.id == message.id)) {
        _messages.add(message);
      }

      // If this was a new conversation, reload conversations
      if (_activeConversation?.isNew == true) {
        await loadConversations();
        // Find the newly created conversation
        final newConv = _conversations.firstWhere(
          (c) => c.otherUser.id == receiverId,
          orElse: () => _activeConversation!,
        );
        _activeConversation = newConv;
      } else {
        // Update conversation preview
        _updateConversationPreview(message);
      }

      notifyListeners();
    } catch (e) {
      _error = 'Failed to send message. Please retry.';
      debugPrint('Failed to send message: $e');
      notifyListeners();
      rethrow;
    }
  }

  /// Mark messages as seen.
  Future<void> markMessagesSeen(String conversationId, String currentUserId) async {
    try {
      await ChatService.markMessagesSeen(conversationId);
      // Update local message status using copyWith for clean state updates
      for (int i = 0; i < _messages.length; i++) {
        if (_messages[i].receiverId == currentUserId && _messages[i].status != 'seen') {
          _messages[i] = _messages[i].copyWith(status: 'seen', isSeen: true);
        }
      }
      // Clear unread count
      final idx = _conversations.indexWhere((c) => c.id == conversationId);
      if (idx != -1) {
        _conversations[idx].unreadCount = 0;
      }
      notifyListeners();
    } catch (e) {
      debugPrint('Failed to mark messages seen: $e');
    }
  }

  /// Handle incoming live message from socket.
  void handleNewMessage(MessageModel message, String currentUserId) {
    final isActiveChat =
        _activeConversation?.id == message.conversationId;

    if (isActiveChat) {
      if (!_messages.any((m) => m.id == message.id)) {
        _messages.add(message);
      }
    }

    // Update conversation list
    final idx =
        _conversations.indexWhere((c) => c.id == message.conversationId);
    if (idx != -1) {
      final conv = _conversations[idx];
      conv.unreadCount = isActiveChat ? 0 : conv.unreadCount + 1;
      // Move to top
      _conversations.removeAt(idx);
      _conversations.insert(0, ConversationModel(
        id: conv.id,
        otherUser: conv.otherUser,
        lastMessage: message.text,
        lastMessageAt: message.createdAt,
        unreadCount: conv.unreadCount,
      ));
    } else {
      // New conversation — reload
      loadConversations();
    }

    notifyListeners();
  }

  /// Handle delivery status update from socket.
  void handleMessagesDelivered(String receiverId, String currentUserId) {
    for (int i = 0; i < _messages.length; i++) {
      if (_messages[i].senderId == currentUserId && _messages[i].status == 'sent') {
        _messages[i] = _messages[i].copyWith(status: 'delivered');
      }
    }
    notifyListeners();
  }

  /// Handle seen status update from socket.
  void handleMessagesSeen(String conversationId, String currentUserId) {
    if (_activeConversation?.id == conversationId) {
      for (int i = 0; i < _messages.length; i++) {
        if (_messages[i].senderId == currentUserId) {
          _messages[i] = _messages[i].copyWith(status: 'seen', isSeen: true);
        }
      }
      notifyListeners();
    }
  }

  void _updateConversationPreview(MessageModel message) {
    final idx = _conversations.indexWhere((c) => c.id == message.conversationId);
    if (idx != -1) {
      final conv = _conversations[idx];
      _conversations.removeAt(idx);
      _conversations.insert(0, ConversationModel(
        id: conv.id,
        otherUser: conv.otherUser,
        lastMessage: message.text,
        lastMessageAt: message.createdAt,
        unreadCount: conv.unreadCount,
      ));
    }
  }

  void clearChat() {
    _activeConversation = null;
    _messages = [];
    notifyListeners();
  }
}
