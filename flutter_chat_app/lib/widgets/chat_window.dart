import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/chat_provider.dart';
import '../providers/socket_provider.dart';
import 'message_bubble.dart';
import 'message_input.dart';

/// The main chat window showing messages for the active conversation.
/// Equivalent to React's ChatWindow.jsx.
class ChatWindow extends StatefulWidget {
  final String currentUserId;

  const ChatWindow({super.key, required this.currentUserId});

  @override
  State<ChatWindow> createState() => _ChatWindowState();
}

class _ChatWindowState extends State<ChatWindow> {
  final ScrollController _scrollController = ScrollController();
  bool _isTyping = false;
  bool _hasInteracted = false;

  @override
  void initState() {
    super.initState();

    // Wire up socket events for typing
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final socketProvider = context.read<SocketProvider>();
      final chatProvider = context.read<ChatProvider>();
      final conv = chatProvider.activeConversation;

      if (conv != null && !conv.isNew && conv.id != null) {
        socketProvider.service.joinChat(conv.id!);
      }

      socketProvider.onTyping = (room) {
        if (room == chatProvider.activeConversation?.id) {
          setState(() => _isTyping = true);
        }
      };
      socketProvider.onStopTyping = (room) {
        if (room == chatProvider.activeConversation?.id) {
          setState(() => _isTyping = false);
        }
      };
    });
  }

  void _scrollToBottom({bool animated = true}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        final position = _scrollController.position.maxScrollExtent;
        if (animated) {
          _scrollController.animateTo(position,
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut);
        } else {
          _scrollController.jumpTo(position);
        }
      }
    });
  }

  void _markActive() {
    if (!_hasInteracted) {
      setState(() => _hasInteracted = true);
    }
    final chatProvider = context.read<ChatProvider>();
    final conv = chatProvider.activeConversation;
    if (conv == null || conv.isNew || conv.id == null) return;

    // Check if there are unseen messages
    final hasUnseen = chatProvider.messages.any(
        (m) => m.receiverId == widget.currentUserId && m.status != 'seen');
    if (hasUnseen) {
      chatProvider.markMessagesSeen(conv.id!, widget.currentUserId);
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<ChatProvider>(
      builder: (context, chatProvider, _) {
        final conv = chatProvider.activeConversation;
        if (conv == null) return const SizedBox.shrink();

        final otherUser = conv.otherUser;
        final isOnline = context.watch<SocketProvider>().isUserOnline(otherUser.id);
        final isConnected = context.watch<SocketProvider>().isConnected;
        final messages = chatProvider.messages;

        // Auto-scroll when new messages arrive
        if (messages.isNotEmpty) {
          _scrollToBottom(animated: true);
        }

        return GestureDetector(
          onTap: _markActive,
          child: KeyboardListener(
            focusNode: FocusNode(),
            onKeyEvent: (event) {
              if (event is KeyDownEvent &&
                  event.logicalKey == LogicalKeyboardKey.escape) {
                chatProvider.clearChat();
              }
            },
            child: Column(
              children: [
                // ── Header ──
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                  decoration: BoxDecoration(
                    color: AppTheme.surface.withOpacity(0.5),
                    border: const Border(
                      bottom: BorderSide(color: AppTheme.border, width: 0.5),
                    ),
                  ),
                  child: Row(
                    children: [
                      // Avatar + online dot
                      Stack(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: AppTheme.surfaceLight,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                  color: AppTheme.border, width: 0.5),
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              otherUser.name.isNotEmpty
                                  ? otherUser.name[0].toUpperCase()
                                  : '?',
                              style: AppTheme.bodyMedium.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          if (isOnline)
                            Positioned(
                              bottom: -1,
                              right: -1,
                              child: Container(
                                width: 12,
                                height: 12,
                                decoration: BoxDecoration(
                                  color: AppTheme.online,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                      color: AppTheme.background, width: 2),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(width: 16),
                      // Name + status
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              otherUser.name,
                              style: AppTheme.bodyMedium.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              isOnline ? 'Active now' : 'Offline',
                              style: AppTheme.labelSmall.copyWith(
                                color: isOnline
                                    ? AppTheme.online
                                    : AppTheme.textFaint,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Connection indicator
                      if (!isConnected)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.orange.withOpacity(0.15),
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusMedium),
                          ),
                          child: Text(
                            'Reconnecting…',
                            style: AppTheme.labelSmall.copyWith(
                              color: Colors.orange,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),

                // ── Messages ──
                Expanded(
                  child: chatProvider.loadingMessages
                      ? const Center(
                          child: CircularProgressIndicator(
                            color: AppTheme.primary,
                            strokeWidth: 2,
                          ),
                        )
                      : messages.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 56,
                                    height: 56,
                                    decoration: BoxDecoration(
                                      color: AppTheme.surface,
                                      borderRadius: BorderRadius.circular(20),
                                      border: Border.all(
                                          color: AppTheme.border, width: 0.5),
                                    ),
                                    alignment: Alignment.center,
                                    child: Icon(Icons.chat_bubble_outline,
                                        color: AppTheme.textFaint, size: 24),
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    'No messages yet — say hello!',
                                    style: AppTheme.bodySmall
                                        .copyWith(color: AppTheme.textFaint),
                                  ),
                                ],
                              ),
                            )
                          : ListView.builder(
                              controller: _scrollController,
                              padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
                              itemCount: messages.length + (_isTyping ? 1 : 0),
                              itemBuilder: (context, index) {
                                if (index == messages.length && _isTyping) {
                                  // Typing indicator
                                  return _buildTypingIndicator();
                                }
                                final msg = messages[index];
                                return MessageBubble(
                                  message: msg,
                                  isOwnMessage:
                                      msg.senderId == widget.currentUserId,
                                );
                              },
                            ),
                ),

                // ── Input ──
                MessageInput(
                  onSendMessage: (text) {
                    chatProvider.sendMessage(otherUser.id, text);
                  },
                  conversationId: conv.isNew ? null : conv.id,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppTheme.surfaceLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
              border: Border.all(color: AppTheme.border, width: 0.5),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) {
                return TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: 1),
                  duration: Duration(milliseconds: 600 + i * 150),
                  builder: (context, value, child) {
                    return Container(
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withOpacity(0.4 + value * 0.4),
                        shape: BoxShape.circle,
                      ),
                    );
                  },
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}
