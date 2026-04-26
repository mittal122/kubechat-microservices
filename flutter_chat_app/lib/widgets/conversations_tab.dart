import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/conversation_model.dart';
import '../providers/chat_provider.dart';
import '../providers/socket_provider.dart';

/// Full-screen conversations tab — replaces the old floating overlay.
class ConversationsTab extends StatelessWidget {
  final VoidCallback onOpenChat;

  const ConversationsTab({super.key, required this.onOpenChat});

  String _formatTime(String? dateString) {
    if (dateString == null) return '';
    try {
      final date = DateTime.parse(dateString).toLocal();
      final now = DateTime.now();
      final diff = now.difference(date);
      if (diff.inDays == 0) return DateFormat.jm().format(date);
      if (diff.inDays == 1) return 'Yesterday';
      if (diff.inDays < 7) return DateFormat.E().format(date);
      return DateFormat.MMMd().format(date);
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
            child: Row(
              children: [
                // Logo
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  alignment: Alignment.center,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.asset(
                      'assets/images/logo.png',
                      width: 26,
                      height: 26,
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  'Chats',
                  style: AppTheme.headingLarge.copyWith(fontSize: 26),
                ),
              ],
            ),
          ),

          // Conversation list
          Expanded(
            child: Consumer<ChatProvider>(
              builder: (context, chatProvider, _) {
                final conversations = chatProvider.conversations;

                if (conversations.isEmpty) {
                  return _buildEmptyState();
                }

                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemCount: conversations.length,
                  itemBuilder: (context, index) {
                    final conv = conversations[index];
                    return _buildConversationTile(context, conv, chatProvider);
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConversationTile(
    BuildContext context,
    ConversationModel conv,
    ChatProvider chatProvider,
  ) {
    final isOnline =
        context.watch<SocketProvider>().isUserOnline(conv.otherUser.id);
    final isActive = chatProvider.activeConversation?.id == conv.id;

    return GestureDetector(
      onTap: () {
        chatProvider.setActiveConversation(conv);
        onOpenChat();
      },
      child: AnimatedContainer(
        duration: AppTheme.animFast,
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: isActive
              ? AppTheme.primary.withAlpha(15)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
          border: isActive
              ? Border.all(color: AppTheme.primary.withAlpha(40))
              : null,
        ),
        child: Row(
          children: [
            // Avatar with online ring
            _buildAvatar(conv.otherUser.name, isOnline),
            const SizedBox(width: 14),

            // Name + last message
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          conv.otherUser.name,
                          style: AppTheme.bodyMedium.copyWith(
                            fontWeight: conv.unreadCount > 0
                                ? FontWeight.w700
                                : FontWeight.w600,
                            fontSize: 15,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        _formatTime(conv.lastMessageAt),
                        style: AppTheme.labelSmall.copyWith(
                          fontSize: 10,
                          color: conv.unreadCount > 0
                              ? AppTheme.primary
                              : AppTheme.textFaint,
                          fontWeight: conv.unreadCount > 0
                              ? FontWeight.w700
                              : FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          conv.lastMessage ?? 'No messages yet',
                          style: AppTheme.bodySmall.copyWith(
                            color: conv.unreadCount > 0
                                ? AppTheme.textSecondary
                                : AppTheme.textMuted,
                            fontWeight: conv.unreadCount > 0
                                ? FontWeight.w500
                                : FontWeight.w400,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (conv.unreadCount > 0)
                        Container(
                          margin: const EdgeInsets.only(left: 8),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppTheme.primary,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '${conv.unreadCount}',
                            style: AppTheme.labelSmall.copyWith(
                              color: AppTheme.background,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(String name, bool isOnline) {
    return Stack(
      children: [
        Container(
          width: 50,
          height: 50,
          decoration: BoxDecoration(
            color: AppTheme.surfaceLight,
            shape: BoxShape.circle,
            border: Border.all(
              color: isOnline
                  ? AppTheme.online.withAlpha(100)
                  : AppTheme.border,
              width: isOnline ? 2 : 1,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            name.isNotEmpty ? name[0].toUpperCase() : '?',
            style: AppTheme.headingSmall.copyWith(
              color: AppTheme.primary,
              fontSize: 18,
            ),
          ),
        ),
        if (isOnline)
          Positioned(
            bottom: 1,
            right: 1,
            child: Container(
              width: 13,
              height: 13,
              decoration: BoxDecoration(
                color: AppTheme.online,
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.background, width: 2),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: const BoxDecoration(
                color: AppTheme.surfaceLight,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.chat_bubble_outline_rounded,
                color: AppTheme.textFaint,
                size: 36,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'No conversations yet',
              style: AppTheme.headingSmall.copyWith(color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 8),
            Text(
              'Go to the Connect tab to find\nfriends and start chatting',
              textAlign: TextAlign.center,
              style: AppTheme.bodySmall.copyWith(
                color: AppTheme.textMuted,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
