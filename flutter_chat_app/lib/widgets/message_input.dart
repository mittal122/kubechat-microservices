import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/socket_provider.dart';

/// Pill-shaped message input bar with animated send button.
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
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
        child: Container(
          decoration: BoxDecoration(
            color: AppTheme.surface,
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
            border: Border.all(color: AppTheme.border, width: 0.5),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Row(
            children: [
              // Text input
              Expanded(
                child: TextField(
                  controller: _controller,
                  focusNode: _focusNode,
                  autofocus: true,
                  style: AppTheme.bodyMedium.copyWith(fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Type a message…',
                    hintStyle:
                        AppTheme.bodyMedium.copyWith(color: AppTheme.textFaint),
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
              // Animated send button
              GestureDetector(
                onTap: _canSend ? _handleSubmit : null,
                child: AnimatedContainer(
                  duration: AppTheme.animFast,
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    gradient:
                        _canSend ? AppTheme.primaryGradient : null,
                    color: _canSend ? null : AppTheme.surfaceLight,
                    shape: BoxShape.circle,
                  ),
                  child: AnimatedScale(
                    scale: _canSend ? 1.0 : 0.85,
                    duration: AppTheme.animFast,
                    child: Icon(
                      Icons.send_rounded,
                      size: 18,
                      color: _canSend
                          ? AppTheme.background
                          : AppTheme.textFaint,
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
