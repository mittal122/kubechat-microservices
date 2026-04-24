import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/conversation_model.dart';
import '../models/user_model.dart';
import '../providers/chat_provider.dart';
import '../providers/socket_provider.dart';
import '../services/chat_service.dart';

/// Floating conversation overlay panel.
/// Equivalent to React's conversation overlay in ChatPage.jsx.
class ConversationOverlay extends StatefulWidget {
  final VoidCallback onClose;

  const ConversationOverlay({super.key, required this.onClose});

  @override
  State<ConversationOverlay> createState() => _ConversationOverlayState();
}

class _ConversationOverlayState extends State<ConversationOverlay> {
  final _searchController = TextEditingController();
  List<UserModel> _searchResults = [];
  bool _isSearching = false;

  Future<void> _handleSearch(String query) async {
    if (query.trim().isEmpty) {
      setState(() {
        _isSearching = false;
        _searchResults = [];
      });
      return;
    }

    setState(() => _isSearching = true);
    try {
      _searchResults = await ChatService.searchUsers(query);
      setState(() {});
    } catch (_) {
      setState(() => _searchResults = []);
    }
  }

  void _selectConversation(ConversationModel conv) {
    final chatProvider = context.read<ChatProvider>();
    chatProvider.setActiveConversation(conv);
    widget.onClose();
  }

  void _startNewChat(UserModel user) {
    final chatProvider = context.read<ChatProvider>();
    // Check if conversation already exists
    final existing = chatProvider.conversations.where(
      (c) => c.otherUser.id == user.id,
    );

    if (existing.isNotEmpty) {
      chatProvider.setActiveConversation(existing.first);
    } else {
      chatProvider.setActiveConversation(ConversationModel.newChat(user));
    }

    _searchController.clear();
    setState(() {
      _isSearching = false;
      _searchResults = [];
    });
    widget.onClose();
  }

  String _formatTime(String? dateString) {
    if (dateString == null) return '';
    try {
      final date = DateTime.parse(dateString).toLocal();
      return DateFormat.jm().format(date);
    } catch (_) {
      return '';
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Backdrop
        GestureDetector(
          onTap: widget.onClose,
          child: Container(color: Colors.black.withOpacity(0.4)),
        ),
        // Panel
        Positioned(
          bottom: 80,
          left: 24,
          child: Material(
            color: Colors.transparent,
            child: Container(
              width: 360,
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height - 160,
              ),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(AppTheme.radiusXL),
                border: Border.all(color: AppTheme.border, width: 0.5),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.4),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Header
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 12, 12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Conversations',
                            style: AppTheme.headingMedium
                                .copyWith(fontSize: 16)),
                        IconButton(
                          onPressed: widget.onClose,
                          icon: const Icon(Icons.close, size: 18),
                          color: AppTheme.textMuted,
                          splashRadius: 16,
                        ),
                      ],
                    ),
                  ),

                  // Search bar
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: TextField(
                      controller: _searchController,
                      onChanged: _handleSearch,
                      style: AppTheme.bodySmall.copyWith(
                          color: AppTheme.textPrimary, fontSize: 14),
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.search,
                            size: 18, color: AppTheme.textFaint),
                        hintText: 'Search people...',
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),

                  // List
                  Flexible(
                    child: _isSearching
                        ? _buildSearchResults()
                        : _buildConversationList(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSearchResults() {
    if (_searchResults.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text('No users found',
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textFaint)),
      );
    }

    return ListView.builder(
      shrinkWrap: true,
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: _searchResults.length,
      itemBuilder: (context, index) {
        final user = _searchResults[index];
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          leading: _buildAvatar(user.name, false),
          title: Text(user.name,
              style: AppTheme.bodyMedium
                  .copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
          subtitle: Text(user.email,
              style: AppTheme.labelSmall.copyWith(fontSize: 12)),
          onTap: () => _startNewChat(user),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppTheme.radiusMedium)),
          hoverColor: AppTheme.surfaceLight,
        );
      },
    );
  }

  Widget _buildConversationList() {
    return Consumer<ChatProvider>(
      builder: (context, chatProvider, _) {
        final conversations = chatProvider.conversations;

        if (conversations.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.person_outline, size: 40, color: AppTheme.textFaint),
                const SizedBox(height: 12),
                Text('No conversations yet',
                    style:
                        AppTheme.bodySmall.copyWith(color: AppTheme.textFaint)),
              ],
            ),
          );
        }

        return ListView.builder(
          shrinkWrap: true,
          padding: const EdgeInsets.symmetric(vertical: 4),
          itemCount: conversations.length,
          itemBuilder: (context, index) {
            final conv = conversations[index];
            final isOnline =
                context.watch<SocketProvider>().isUserOnline(conv.otherUser.id);
            final isActive =
                chatProvider.activeConversation?.id == conv.id;

            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: isActive
                    ? AppTheme.primary.withOpacity(0.12)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                border: isActive
                    ? Border.all(
                        color: AppTheme.primary.withOpacity(0.3), width: 0.5)
                    : null,
              ),
              child: ListTile(
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                leading: _buildAvatar(conv.otherUser.name, isOnline),
                title: Row(
                  children: [
                    Expanded(
                      child: Text(
                        conv.otherUser.name,
                        style: AppTheme.bodyMedium.copyWith(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      _formatTime(conv.lastMessageAt),
                      style: AppTheme.labelSmall.copyWith(
                        fontSize: 10,
                        color: conv.unreadCount > 0
                            ? AppTheme.seen
                            : AppTheme.textFaint,
                        fontWeight: conv.unreadCount > 0
                            ? FontWeight.w700
                            : FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                subtitle: Row(
                  children: [
                    Expanded(
                      child: Text(
                        conv.lastMessage ?? 'No messages yet',
                        style: AppTheme.labelSmall.copyWith(fontSize: 12),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (conv.unreadCount > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppTheme.error,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '${conv.unreadCount}',
                          style: AppTheme.labelSmall.copyWith(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                  ],
                ),
                onTap: () => _selectConversation(conv),
                shape: RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(AppTheme.radiusMedium)),
                hoverColor: AppTheme.surfaceLight,
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildAvatar(String name, bool isOnline) {
    return Stack(
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: AppTheme.surfaceLight,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.border, width: 0.5),
          ),
          alignment: Alignment.center,
          child: Text(
            name.isNotEmpty ? name[0].toUpperCase() : '?',
            style: AppTheme.bodyMedium.copyWith(fontWeight: FontWeight.w700),
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
                border: Border.all(color: AppTheme.surface, width: 2),
              ),
            ),
          ),
      ],
    );
  }
}
