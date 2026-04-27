import 'dart:async';
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
  String? _error;
  Timer? _pollTimer;

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

  /// Start fallback polling (refreshes conversations + active messages every 15s).
  /// This is a safety net in case WebSocket events fail to deliver.
  void startFallbackPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      _silentRefresh();
    });
  }

  /// Stop fallback polling.
  void stopFallbackPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  /// Silent refresh — update conversations and active chat messages
  /// without showing loading indicators. Only notifies if data changed.
  Future<void> _silentRefresh() async {
    try {
      final newConversations = await ChatService.getConversations();
      // Check if conversations changed
      if (_conversationsChanged(newConversations)) {
        _conversations = newConversations;
        notifyListeners();
        debugPrint('[ChatProvider] 🔄 Poll: conversations updated');
      }

      // If active conversation exists, refresh messages too
      if (_activeConversation != null && !_activeConversation!.isNew && _activeConversation!.id != null) {
        final newMessages = await ChatService.getMessages(_activeConversation!.id!);
        if (newMessages.length != _messages.length) {
          _messages = newMessages;
          notifyListeners();
          debugPrint('[ChatProvider] 🔄 Poll: messages updated (${newMessages.length} msgs)');
        }
      }
    } catch (e) {
      // Silent — don't show errors for background polling
      debugPrint('[ChatProvider] Poll error: $e');
    }
  }

  bool _conversationsChanged(List<ConversationModel> newList) {
    if (newList.length != _conversations.length) return true;
    for (int i = 0; i < newList.length; i++) {
      if (newList[i].lastMessage != _conversations[i].lastMessage ||
          newList[i].unreadCount != _conversations[i].unreadCount) {
        return true;
      }
    }
    return false;
  }

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
      for (int i = 0; i < _messages.length; i++) {
        if (_messages[i].receiverId == currentUserId && _messages[i].status != 'seen') {
          _messages[i] = _messages[i].copyWith(status: 'seen', isSeen: true);
        }
      }
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
    debugPrint('[ChatProvider] 📩 handleNewMessage: ${message.text} (convId: ${message.conversationId})');
    debugPrint('[ChatProvider] activeConversation: ${_activeConversation?.id}');

    final isActiveChat =
        _activeConversation?.id == message.conversationId;

    if (isActiveChat) {
      if (!_messages.any((m) => m.id == message.id)) {
        _messages.add(message);
        debugPrint('[ChatProvider] ✅ Message added to active chat');
      }
    } else {
      debugPrint('[ChatProvider] Message for inactive chat — updating conversation list');
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

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }
}
