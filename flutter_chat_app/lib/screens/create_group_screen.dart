import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/user_model.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../services/chat_service.dart';

const int kMaxGroupMembers = 5;

/// Screen for creating a new group chat.
/// Allows selecting up to 4 friends (+ yourself = 5 total).
class CreateGroupScreen extends StatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  State<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends State<CreateGroupScreen> {
  final TextEditingController _groupNameCtrl = TextEditingController();
  final TextEditingController _searchCtrl = TextEditingController();

  List<UserModel> _searchResults = [];
  List<UserModel> _selectedMembers = [];
  bool _isSearching = false;
  bool _isCreating = false;
  String? _error;

  @override
  void dispose() {
    _groupNameCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    if (query.trim().isEmpty) {
      setState(() => _searchResults = []);
      return;
    }
    setState(() => _isSearching = true);
    try {
      final results = await ChatService.searchUsers(query.trim());
      setState(() => _searchResults = results);
    } catch (_) {
      setState(() => _searchResults = []);
    } finally {
      setState(() => _isSearching = false);
    }
  }

  void _toggleMember(UserModel user) {
    setState(() {
      if (_selectedMembers.any((m) => m.id == user.id)) {
        _selectedMembers.removeWhere((m) => m.id == user.id);
      } else {
        // Max 4 friends (you are the 5th)
        if (_selectedMembers.length >= kMaxGroupMembers - 1) {
          _error = 'Max ${kMaxGroupMembers - 1} members allowed (group limit: $kMaxGroupMembers)';
          return;
        }
        _selectedMembers.add(user);
        _error = null;
      }
    });
  }

  Future<void> _createGroup() async {
    final name = _groupNameCtrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Please enter a group name');
      return;
    }
    if (_selectedMembers.isEmpty) {
      setState(() => _error = 'Select at least 1 member');
      return;
    }

    setState(() {
      _isCreating = true;
      _error = null;
    });

    try {
      final chatProvider = context.read<ChatProvider>();
      final group = await ChatService.createGroup(
        groupName: name,
        memberIds: _selectedMembers.map((m) => m.id).toList(),
      );
      await chatProvider.loadConversations();

      if (mounted) {
        Navigator.of(context).pop(group);
      }
    } catch (e) {
      setState(() {
        _error = e.toString().contains('5')
            ? 'Group cannot have more than 5 members'
            : 'Failed to create group. Try again.';
      });
    } finally {
      if (mounted) setState(() => _isCreating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = context.read<AuthProvider>().user;

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: Container(
        decoration: const BoxDecoration(gradient: AppTheme.backgroundGradient),
        child: SafeArea(
          child: Column(
            children: [
              // ── Header ──
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.arrow_back_rounded,
                          color: AppTheme.textSecondary, size: 22),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        'New Group',
                        style: AppTheme.headingSmall,
                      ),
                    ),
                    // Slots indicator
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withAlpha(20),
                        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                      ),
                      child: Text(
                        '${_selectedMembers.length}/${kMaxGroupMembers - 1} members',
                        style: AppTheme.labelSmall.copyWith(
                          color: AppTheme.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // ── Group Name Input ──
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Container(
                  decoration: BoxDecoration(
                    color: AppTheme.surface,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: TextField(
                    controller: _groupNameCtrl,
                    style: AppTheme.bodyMedium,
                    decoration: InputDecoration(
                      hintText: 'Group name...',
                      hintStyle: AppTheme.bodyMedium.copyWith(color: AppTheme.textFaint),
                      prefixIcon: const Icon(Icons.group_rounded,
                          color: AppTheme.textFaint, size: 20),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                    ),
                  ),
                ),
              ),

              // ── Search Users ──
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Container(
                  decoration: BoxDecoration(
                    color: AppTheme.surface,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: TextField(
                    controller: _searchCtrl,
                    onChanged: _search,
                    style: AppTheme.bodyMedium,
                    decoration: InputDecoration(
                      hintText: 'Search users to add...',
                      hintStyle: AppTheme.bodyMedium.copyWith(color: AppTheme.textFaint),
                      prefixIcon: const Icon(Icons.search_rounded,
                          color: AppTheme.textFaint, size: 20),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      suffixIcon: _isSearching
                          ? const Padding(
                              padding: EdgeInsets.all(12),
                              child: SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppTheme.primary,
                                ),
                              ),
                            )
                          : null,
                    ),
                  ),
                ),
              ),

              // ── Selected Members Chips ──
              if (_selectedMembers.isNotEmpty)
                SizedBox(
                  height: 52,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    scrollDirection: Axis.horizontal,
                    itemCount: _selectedMembers.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (_, i) {
                      final m = _selectedMembers[i];
                      return GestureDetector(
                        onTap: () => _toggleMember(m),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppTheme.primary.withAlpha(30),
                            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                            border: Border.all(
                                color: AppTheme.primary.withAlpha(80)),
                          ),
                          child: Row(
                            children: [
                              Text(m.name,
                                  style: AppTheme.labelSmall.copyWith(
                                    color: AppTheme.primary,
                                    fontWeight: FontWeight.w600,
                                  )),
                              const SizedBox(width: 4),
                              const Icon(Icons.close_rounded,
                                  size: 14, color: AppTheme.primary),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),

              // ── Error ──
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    _error!,
                    style: AppTheme.labelSmall.copyWith(color: AppTheme.error),
                  ),
                ),

              // ── Search Results ──
              Expanded(
                child: _searchResults.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.group_add_rounded,
                                color: AppTheme.textFaint, size: 48),
                            const SizedBox(height: 12),
                            Text('Search for users to add',
                                style: AppTheme.bodySmall
                                    .copyWith(color: AppTheme.textMuted)),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: _searchResults.length,
                        itemBuilder: (_, i) {
                          final user = _searchResults[i];
                          // Skip yourself
                          if (user.id == currentUser?.id) {
                            return const SizedBox.shrink();
                          }
                          final isSelected =
                              _selectedMembers.any((m) => m.id == user.id);
                          return ListTile(
                            onTap: () => _toggleMember(user),
                            leading: Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                color: AppTheme.surfaceLight,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: isSelected
                                      ? AppTheme.primary
                                      : AppTheme.border,
                                  width: isSelected ? 2 : 1,
                                ),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                user.name[0].toUpperCase(),
                                style: AppTheme.headingSmall.copyWith(
                                  color: AppTheme.primary,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                            title: Text(user.name, style: AppTheme.bodyMedium),
                            subtitle: Text(user.email,
                                style: AppTheme.bodySmall
                                    .copyWith(color: AppTheme.textMuted)),
                            trailing: AnimatedContainer(
                              duration: AppTheme.animFast,
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppTheme.primary
                                    : AppTheme.surfaceLight,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: isSelected
                                      ? AppTheme.primary
                                      : AppTheme.border,
                                ),
                              ),
                              child: isSelected
                                  ? const Icon(Icons.check_rounded,
                                      size: 14, color: Colors.white)
                                  : null,
                            ),
                          );
                        },
                      ),
              ),

              // ── Create Button ──
              Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed:
                        (_isCreating || _selectedMembers.isEmpty) ? null : _createGroup,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      disabledBackgroundColor: AppTheme.surfaceLight,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusMedium),
                      ),
                    ),
                    child: _isCreating
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : Text(
                            'Create Group  👥',
                            style: AppTheme.bodyMedium.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
