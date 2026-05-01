import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/chat_provider.dart';
import '../providers/socket_provider.dart';
import 'message_bubble.dart';
import 'message_input.dart';

/// Full-screen chat window — pushed as a new route from conversations tab.
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
  bool _showScrollFab = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);

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

  void _onScroll() {
    if (_scrollController.hasClients) {
      final maxScroll = _scrollController.position.maxScrollExtent;
      final currentScroll = _scrollController.offset;
      final shouldShow = maxScroll - currentScroll > 200;
      if (shouldShow != _showScrollFab) {
        setState(() => _showScrollFab = shouldShow);
      }
    }
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
        if (conv == null) {
          return const Scaffold(
            backgroundColor: AppTheme.background,
            body: Center(child: Text('No conversation selected')),
          );
        }

        final otherUser = conv.otherUser;
        final isOnline = chatProvider.isUserOnline(otherUser.id);
        final isConnected = true; // Hardcoded to true to hide reconnecting banner since we use polling now
        final messages = chatProvider.messages;

        if (messages.isNotEmpty) {
          _scrollToBottom(animated: true);
        }

        return Scaffold(
          backgroundColor: AppTheme.background,
          body: Container(
            decoration:
                const BoxDecoration(gradient: AppTheme.backgroundGradient),
            child: GestureDetector(
              onTap: _markActive,
              child: Column(
                children: [
                  // ── Header ──
                  SafeArea(
                    bottom: false,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppTheme.surface.withAlpha(220),
                        border: const Border(
                          bottom:
                              BorderSide(color: AppTheme.border, width: 0.5),
                        ),
                      ),
                      child: Row(
                        children: [
                          // Back button
                          IconButton(
                            onPressed: () {
                              chatProvider.clearChat();
                              Navigator.of(context).pop();
                            },
                            icon: const Icon(Icons.arrow_back_rounded,
                                size: 22, color: AppTheme.textSecondary),
                          ),
                          const SizedBox(width: 4),
                          // Avatar
                          Stack(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: AppTheme.surfaceLight,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: isOnline
                                        ? AppTheme.online.withAlpha(80)
                                        : AppTheme.border,
                                    width: isOnline ? 2 : 1,
                                  ),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  otherUser.name.isNotEmpty
                                      ? otherUser.name[0].toUpperCase()
                                      : '?',
                                  style: AppTheme.headingSmall.copyWith(
                                    color: AppTheme.primary,
                                    fontSize: 16,
                                  ),
                                ),
                              ),
                              if (isOnline)
                                Positioned(
                                  bottom: 0,
                                  right: 0,
                                  child: Container(
                                    width: 12,
                                    height: 12,
                                    decoration: BoxDecoration(
                                      color: AppTheme.online,
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                          color: AppTheme.surface, width: 2),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(width: 12),
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
                                const SizedBox(height: 1),
                                Text(
                                  _isTyping
                                      ? 'typing...'
                                      : isOnline
                                          ? 'Active now'
                                          : 'Offline',
                                  style: AppTheme.labelSmall.copyWith(
                                    color: _isTyping
                                        ? AppTheme.primary
                                        : isOnline
                                            ? AppTheme.online
                                            : AppTheme.textFaint,
                                    fontStyle: _isTyping
                                        ? FontStyle.italic
                                        : FontStyle.normal,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (!isConnected)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.orange.withAlpha(30),
                                borderRadius: BorderRadius.circular(
                                    AppTheme.radiusPill),
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
                  ),

                  // ── Messages ──
                  Expanded(
                    child: Stack(
                      children: [
                        chatProvider.loadingMessages
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
                                          width: 60,
                                          height: 60,
                                          decoration: const BoxDecoration(
                                            color: AppTheme.surfaceLight,
                                            shape: BoxShape.circle,
                                          ),
                                          alignment: Alignment.center,
                                          child: const Icon(
                                              Icons
                                                  .chat_bubble_outline_rounded,
                                              color: AppTheme.textFaint,
                                              size: 26),
                                        ),
                                        const SizedBox(height: 14),
                                        Text(
                                          'Say hello! 👋',
                                          style: AppTheme.bodyMedium.copyWith(
                                            color: AppTheme.textSecondary,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Start a conversation with ${otherUser.name}',
                                          style: AppTheme.bodySmall.copyWith(
                                              color: AppTheme.textMuted),
                                        ),
                                      ],
                                    ),
                                  )
                                : ListView.builder(
                                    controller: _scrollController,
                                    padding: const EdgeInsets.fromLTRB(
                                        16, 16, 16, 8),
                                    itemCount: messages.length +
                                        (_isTyping ? 1 : 0),
                                    itemBuilder: (context, index) {
                                      if (index == messages.length &&
                                          _isTyping) {
                                        return _buildTypingIndicator();
                                      }
                                      final msg = messages[index];
                                      return MessageBubble(
                                        message: msg,
                                        isOwnMessage: msg.senderId ==
                                            widget.currentUserId,
                                      );
                                    },
                                  ),
                        // Scroll to bottom FAB
                        if (_showScrollFab)
                          Positioned(
                            bottom: 8,
                            right: 16,
                            child: GestureDetector(
                              onTap: () => _scrollToBottom(),
                              child: Container(
                                width: 38,
                                height: 38,
                                decoration: BoxDecoration(
                                  color: AppTheme.surface,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                      color: AppTheme.border),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withAlpha(50),
                                      blurRadius: 8,
                                    ),
                                  ],
                                ),
                                child: const Icon(
                                  Icons.keyboard_arrow_down_rounded,
                                  color: AppTheme.textSecondary,
                                  size: 20,
                                ),
                              ),
                            ),
                          ),
                      ],
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
                        color:
                            AppTheme.primary.withAlpha((100 + value * 150).toInt()),
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
