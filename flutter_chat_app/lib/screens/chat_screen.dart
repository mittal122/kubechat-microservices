import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/message_model.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../providers/socket_provider.dart';
import '../widgets/chat_window.dart';
import '../widgets/conversations_tab.dart';
import '../widgets/discover_tab.dart';
import '../widgets/profile_tab.dart';

/// Main chat screen — 3-tab bottom navigation architecture.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  int _currentTab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initialize());
  }

  Future<void> _initialize() async {
    final auth = context.read<AuthProvider>();
    final chatProvider = context.read<ChatProvider>();
    final socketProvider = context.read<SocketProvider>();

    await chatProvider.loadConversations();
    await socketProvider.connect();

    socketProvider.onNewMessage = (data) {
      if (auth.user == null) return;
      final message = MessageModel.fromJson(data);
      chatProvider.handleNewMessage(message, auth.user!.id);

      if (chatProvider.activeConversation?.id == message.conversationId) {
        chatProvider.markMessagesSeen(message.conversationId, auth.user!.id);
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
