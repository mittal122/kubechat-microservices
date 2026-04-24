import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/socket_provider.dart';

/// Message input bar with typing indicator logic.
/// Equivalent to React's MessageInput.jsx.
class MessageInput extends StatefulWidget {
  final Function(String) onSendMessage;
  final String? conversationId;

  const MessageInput({
    super.key,
    required this.onSendMessage,
    this.conversationId,
  });

  @override
  State<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  bool _isTyping = false;
  Timer? _typingTimer;

  bool get _canSend => _controller.text.trim().isNotEmpty;

  void _handleSubmit() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    // Stop typing indicator
    _stopTyping();

    widget.onSendMessage(text);
    _controller.clear();
    setState(() {});
    _focusNode.requestFocus();
  }

  void _handleTextChange(String value) {
    setState(() {});

    final socketProvider = context.read<SocketProvider>();
    if (widget.conversationId == null) return;

    if (!_isTyping) {
      socketProvider.service.emitTyping(widget.conversationId!);
      _isTyping = true;
    }

    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(milliseconds: 1500), () {
      _stopTyping();
    });
  }

  void _stopTyping() {
    if (_isTyping && widget.conversationId != null) {
      final socketProvider = context.read<SocketProvider>();
      socketProvider.service.emitStopTyping(widget.conversationId!);
      _isTyping = false;
    }
    _typingTimer?.cancel();
  }

  @override
  void dispose() {
    _typingTimer?.cancel();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 768),
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(AppTheme.radiusXL),
          border: Border.all(color: AppTheme.border, width: 0.5),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            // Text input
            Expanded(
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                autofocus: true,
                style: AppTheme.bodyMedium,
                decoration: InputDecoration(
                  hintText: 'Type a message…',
                  hintStyle: AppTheme.bodyMedium
                      .copyWith(color: AppTheme.textFaint),
                  border: InputBorder.none,
                  filled: false,
                  contentPadding: EdgeInsets.zero,
                  isDense: true,
                ),
                onChanged: _handleTextChange,
                onSubmitted: (_) => _handleSubmit(),
                textInputAction: TextInputAction.send,
              ),
            ),
            const SizedBox(width: 8),
            // Send button
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                gradient: _canSend ? AppTheme.primaryGradient : null,
                color: _canSend ? null : AppTheme.surfaceLight,
                borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  onTap: _canSend ? _handleSubmit : null,
                  child: Icon(
                    Icons.send_rounded,
                    size: 18,
                    color: _canSend
                        ? Colors.white
                        : AppTheme.textFaint,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
