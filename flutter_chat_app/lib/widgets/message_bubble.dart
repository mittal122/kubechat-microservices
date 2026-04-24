import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/app_theme.dart';
import '../../models/message_model.dart';

/// A single message bubble — sent (right, violet) or received (left, dark surface).
/// Equivalent to React's MessageBubble.jsx.
class MessageBubble extends StatelessWidget {
  final MessageModel message;
  final bool isOwnMessage;

  const MessageBubble({
    super.key,
    required this.message,
    required this.isOwnMessage,
  });

  String _formatTime(String dateString) {
    try {
      final date = DateTime.parse(dateString).toLocal();
      return DateFormat.jm().format(date);
    } catch (_) {
      return '';
    }
  }

  Widget _buildTick() {
    if (!isOwnMessage) return const SizedBox.shrink();

    if (message.status == 'seen' || message.isSeen) {
      return const Icon(Icons.done_all, size: 14, color: AppTheme.seen);
    } else if (message.status == 'delivered') {
      return Icon(Icons.done_all, size: 14, color: AppTheme.delivered);
    } else {
      return Icon(Icons.check, size: 14, color: AppTheme.sent);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment:
            isOwnMessage ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.55,
            ),
            decoration: BoxDecoration(
              gradient: isOwnMessage ? AppTheme.primaryGradient : null,
              color: isOwnMessage ? null : AppTheme.surfaceLight,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(AppTheme.radiusLarge),
                topRight: const Radius.circular(AppTheme.radiusLarge),
                bottomLeft: Radius.circular(
                    isOwnMessage ? AppTheme.radiusLarge : 4),
                bottomRight: Radius.circular(
                    isOwnMessage ? 4 : AppTheme.radiusLarge),
              ),
              border: isOwnMessage
                  ? null
                  : Border.all(color: AppTheme.border, width: 0.5),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Column(
              crossAxisAlignment: isOwnMessage
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                Text(
                  message.text,
                  style: AppTheme.bodyMedium.copyWith(
                    color: isOwnMessage
                        ? Colors.white
                        : AppTheme.textPrimary.withOpacity(0.9),
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _formatTime(message.createdAt),
                      style: AppTheme.labelSmall.copyWith(
                        color: isOwnMessage
                            ? Colors.white.withOpacity(0.6)
                            : AppTheme.textFaint,
                        fontSize: 10,
                      ),
                    ),
                    if (isOwnMessage) ...[
                      const SizedBox(width: 4),
                      _buildTick(),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
