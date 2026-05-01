import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/message_model.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../providers/socket_provider.dart';
import '../services/notification_service.dart';
import '../widgets/chat_window.dart';
import '../widgets/conversations_tab.dart';
import '../widgets/discover_tab.dart';
import '../widgets/profile_tab.dart';
import '../services/chat_service.dart';

/// Main chat screen — 3-tab bottom navigation architecture.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  int _currentTab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _initialize());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ChatService.updatePresence(false);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ChatService.updatePresence(true);
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.detached) {
      ChatService.updatePresence(false);
    }
  }

  Future<void> _initialize() async {
    final auth = context.read<AuthProvider>();
    final chatProvider = context.read<ChatProvider>();
    final socketProvider = context.read<SocketProvider>();

    // Initialize notification service
    await NotificationService().initialize();

    await chatProvider.loadConversations();
    await socketProvider.connect(); // Kept for future, but polling will do the heavy lifting
    ChatService.updatePresence(true);

    // Start fallback polling — safety net in case WebSocket misses events
    chatProvider.startFallbackPolling();

    socketProvider.onNewMessage = (data) {
      if (auth.user == null) return;
      debugPrint('[ChatScreen] 📩 Socket newMessage event received');
      final message = MessageModel.fromJson(data);
      chatProvider.handleNewMessage(message, auth.user!.id);

      final isActiveChat = chatProvider.activeConversation?.id == message.conversationId;

      if (isActiveChat) {
        // User is viewing this chat — mark as seen, no notification
        chatProvider.markMessagesSeen(message.conversationId, auth.user!.id);
        NotificationService().cancelForConversation(message.conversationId);
      } else {
        // User is NOT in this chat — show push notification
        _showNotificationForMessage(message, chatProvider);
      }
    };

    socketProvider.onMessagesDelivered = (data) {
      if (auth.user == null) return;
      final receiverId = data['receiverId'] as String;
      chatProvider.handleMessagesDelivered(receiverId, auth.user!.id);
    };

    socketProvider.onMessagesSeen = (data) {
      if (auth.user == null) return;
      final conversationId = data['conversationId'] as String;
      chatProvider.handleMessagesSeen(conversationId, auth.user!.id);
    };
  }

  /// Show a local push notification for a message from a non-active conversation.
  void _showNotificationForMessage(MessageModel message, ChatProvider chatProvider) {
    // Find sender name from conversation list
    String senderName = 'New Message';
    final conv = chatProvider.conversations.firstWhere(
      (c) => c.id == message.conversationId,
      orElse: () => chatProvider.conversations.first,
    );
    senderName = conv.otherUser.name;

    NotificationService().showMessageNotification(
      senderName: senderName,
      messageText: message.text,
      conversationId: message.conversationId,
    );
  }

  void _openChat() {
    // Navigate to chat window as a pushed screen
    Navigator.of(context).push(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) {
          final auth = context.read<AuthProvider>();
          return ChatWindow(currentUserId: auth.user!.id);
        },
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(1, 0),
              end: Offset.zero,
            ).animate(CurvedAnimation(
              parent: animation,
              curve: Curves.easeOutCubic,
            )),
            child: child,
          );
        },
        transitionDuration: AppTheme.animNormal,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chatProvider = context.watch<ChatProvider>();

    // If a conversation was just selected, open chat
    // We listen for activeConversation changes
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppTheme.backgroundGradient),
        child: IndexedStack(
          index: _currentTab,
          children: [
            ConversationsTab(onOpenChat: _openChat),
            const DiscoverTab(),
            const ProfileTab(),
          ],
        ),
      ),
      bottomNavigationBar: _buildBottomNav(chatProvider.totalUnread),
    );
  }

  Widget _buildBottomNav(int totalUnread) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface.withAlpha(240),
        border: const Border(
          top: BorderSide(color: AppTheme.border, width: 0.5),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(
                index: 0,
                icon: Icons.chat_bubble_rounded,
                label: 'Chats',
                badgeCount: totalUnread,
              ),
              _buildNavItem(
                index: 1,
                icon: Icons.link_rounded,
                label: 'Connect',
              ),
              _buildNavItem(
                index: 2,
                icon: Icons.person_rounded,
                label: 'Profile',
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required IconData icon,
    required String label,
    int badgeCount = 0,
  }) {
    final isActive = _currentTab == index;
    return GestureDetector(
      onTap: () => setState(() => _currentTab = index),
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: AppTheme.animFast,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? AppTheme.primary.withAlpha(20) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppTheme.radiusPill),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  icon,
                  size: 22,
                  color: isActive ? AppTheme.primary : AppTheme.textMuted,
                ),
                if (badgeCount > 0)
                  Positioned(
                    right: -8,
                    top: -4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppTheme.error,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        badgeCount > 99 ? '99+' : '$badgeCount',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: AppTheme.labelSmall.copyWith(
                fontSize: 10,
                color: isActive ? AppTheme.primary : AppTheme.textMuted,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
