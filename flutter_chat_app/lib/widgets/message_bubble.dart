import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../config/app_theme.dart';
import '../models/message_model.dart';

/// Message bubble — teal gradient for sent, frosted surface for received.
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
      return const Icon(Icons.done_all, size: 14, color: AppTheme.delivered);
    } else {
      return const Icon(Icons.check, size: 14, color: AppTheme.sent);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisAlignment:
            isOwnMessage ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.72,
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
              boxShadow: isOwnMessage
                  ? [
                      BoxShadow(
                        color: AppTheme.primary.withAlpha(30),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Column(
              crossAxisAlignment: isOwnMessage
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                Text(
                  message.text,
                  style: AppTheme.bodyMedium.copyWith(
                    color: isOwnMessage
                        ? AppTheme.background
                        : AppTheme.textPrimary,
                    height: 1.4,
                    fontSize: 14,
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
                            ? AppTheme.background.withAlpha(150)
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
