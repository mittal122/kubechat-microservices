import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../models/message_model.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/socket_provider.dart';
import '../../widgets/chat_window.dart';
import '../../widgets/conversation_overlay.dart';

/// Main chat screen — the entire app interface after login.
/// Equivalent to React's ChatPage.jsx.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  bool _showOverlay = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initialize());
  }

  Future<void> _initialize() async {
    final auth = context.read<AuthProvider>();
    final chatProvider = context.read<ChatProvider>();
    final socketProvider = context.read<SocketProvider>();

    // Load conversations
    await chatProvider.loadConversations();

    // Connect socket
    await socketProvider.connect();

    // Wire socket events to chat provider
    socketProvider.onNewMessage = (data) {
      if (auth.user == null) return; // Guard: user may be logging out
      final message = MessageModel.fromJson(data);
      chatProvider.handleNewMessage(message, auth.user!.id);

      // If active conversation, mark as seen automatically
      if (chatProvider.activeConversation?.id == message.conversationId) {
        chatProvider.markMessagesSeen(message.conversationId, auth.user!.id);
      }
    };

    socketProvider.onMessagesDelivered = (data) {
      if (auth.user == null) return; // Guard: user may be logging out
      final receiverId = data['receiverId'] as String;
      chatProvider.handleMessagesDelivered(receiverId, auth.user!.id);
    };

    socketProvider.onMessagesSeen = (data) {
      if (auth.user == null) return; // Guard: user may be logging out
      final conversationId = data['conversationId'] as String;
      chatProvider.handleMessagesSeen(conversationId, auth.user!.id);
    };
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final chatProvider = context.watch<ChatProvider>();
    final socketProvider = context.watch<SocketProvider>();
    final hasActiveChat = chatProvider.activeConversation != null;

    // Show error SnackBar when ChatProvider reports an error
    if (chatProvider.error != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(chatProvider.error!),
            backgroundColor: AppTheme.error,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 3),
          ),
        );
        chatProvider.clearError();
      });
    }

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppTheme.backgroundGradient),
        child: Stack(
          children: [
            // ── Main Content ──
            Column(
              children: [
                // Top bar
                SafeArea(
                  bottom: false,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppTheme.surface.withOpacity(0.3),
                      border: const Border(
                        bottom: BorderSide(color: AppTheme.border, width: 0.5),
                      ),
                    ),
                  child: Row(
                    children: [
                      // Logo
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          gradient: AppTheme.primaryGradient,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        alignment: Alignment.center,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.asset(
                            'assets/images/logo.png',
                            width: 36,
                            height: 36,
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'KubeChat',
                        style: AppTheme.headingMedium.copyWith(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      
                      // Active conversations toggle
                      Tooltip(
                        message: 'Conversations',
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            onTap: () => setState(() => _showOverlay = !_showOverlay),
                            child: Container(
                              padding: const EdgeInsets.all(8),
                              child: Stack(
                                children: [
                                  const Icon(Icons.forum_rounded,
                                      size: 20, color: AppTheme.textSecondary),
                                  if (chatProvider.totalUnread > 0)
                                    Positioned(
                                      right: 0,
                                      top: 0,
                                      child: Container(
                                        padding: const EdgeInsets.all(3),
                                        decoration: const BoxDecoration(
                                          color: AppTheme.error,
                                          shape: BoxShape.circle,
                                        ),
                                        child: Text(
                                          '${chatProvider.totalUnread}',
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 8,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),

                      // User info
                      Text(
                        auth.user?.name ?? '',
                        style: AppTheme.bodySmall.copyWith(
                          fontWeight: FontWeight.w500,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                      const SizedBox(width: 12),

                      // Logout
                      Tooltip(
                        message: 'Logout',
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            onTap: () async {
                              socketProvider.disconnect();
                              chatProvider.clearChat();
                              await auth.logout();
                            },
                            child: Container(
                              padding: const EdgeInsets.all(8),
                              child: const Icon(Icons.logout_rounded,
                                  size: 18, color: AppTheme.textMuted),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                ),

                // Chat content
                Expanded(
                  child: hasActiveChat
                      ? ChatWindow(currentUserId: auth.user!.id)
                      : _buildWelcomeView(auth),
                ),
              ],
            ),

            // ── Conversation Overlay ──
            if (_showOverlay)
              ConversationOverlay(
                onClose: () => setState(() => _showOverlay = false),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildChatFab(int unreadCount) {
    return Stack(
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            onTap: () => setState(() => _showOverlay = !_showOverlay),
            child: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.primary.withOpacity(0.5),
                    blurRadius: 20,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: Icon(
                _showOverlay ? Icons.close : Icons.chat_bubble_rounded,
                color: Colors.white,
                size: 22,
              ),
            ),
          ),
        ),
        // Unread badge
        if (unreadCount > 0)
          Positioned(
            top: -4,
            right: -4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppTheme.error,
                borderRadius: BorderRadius.circular(10),
                border:
                    Border.all(color: AppTheme.background, width: 2),
              ),
              child: Text(
                unreadCount > 99 ? '99+' : '$unreadCount',
                style: AppTheme.labelSmall.copyWith(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildWelcomeView(AuthProvider auth) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: AppTheme.border, width: 0.5),
            ),
            alignment: Alignment.center,
            child: const Icon(
              Icons.chat_bubble_outline,
              color: AppTheme.primary,
              size: 36,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Welcome, ${auth.user?.name ?? 'User'}',
            style: AppTheme.headingLarge.copyWith(fontSize: 28),
          ),
          const SizedBox(height: 8),
          Text(
            'Select a conversation or search for someone to start chatting.',
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textFaint),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () => setState(() => _showOverlay = true),
            icon: const Icon(Icons.chat_rounded, size: 18),
            label: const Text('Start a conversation'),
          ),
        ],
      ),
    );
  }
}
