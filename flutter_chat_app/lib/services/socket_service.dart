import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../config/api_config.dart';
import 'storage_service.dart';

/// Socket.IO service — manages WebSocket connection with JWT authentication.
/// Equivalent to React's SocketContext.jsx.
class SocketService {
  IO.Socket? _socket;

  IO.Socket? get socket => _socket;
  bool get isConnected => _socket?.connected ?? false;

  /// Connect to the Socket.IO server with JWT auth.
  Future<void> connect({
    required Function(List<String>) onOnlineUsers,
    required Function(Map<String, dynamic>) onNewMessage,
    required Function(Map<String, dynamic>) onMessagesDelivered,
    required Function(Map<String, dynamic>) onMessagesSeen,
    required Function(String) onTyping,
    required Function(String) onStopTyping,
    required Function() onConnected,
    required Function() onDisconnected,
  }) async {
    // Dispose any existing socket first to prevent duplication
    if (_socket != null) {
      _socket!.dispose();
      _socket = null;
    }

    final token = await StorageService.getAccessToken();
    if (token == null) {
      debugPrint('[Socket] No token — skipping connection');
      return;
    }

    debugPrint('[Socket] Connecting to ${ApiConfig.baseUrl}');

    _socket = IO.io(
      ApiConfig.baseUrl,
      IO.OptionBuilder()
          // ╔══════════════════════════════════════════════════════════════╗
          // ║  FIX: Force WebSocket-only transport.                       ║
          // ║  HTTP long-polling through Ngrok's reverse proxy causes     ║
          // ║  response buffering — messages queue until the poll times   ║
          // ║  out or the connection drops (= "only see messages after    ║
          // ║  disconnect"). WebSocket gives a persistent, unbuffered     ║
          // ║  bidirectional channel.                                     ║
          // ╚══════════════════════════════════════════════════════════════╝
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setReconnectionAttempts(double.infinity.toInt())
          .setExtraHeaders({'ngrok-skip-browser-warning': 'true'})
          .build(),
    );

    _socket!.onConnect((_) {
      debugPrint('[Socket] ✅ Connected (id: ${_socket!.id})');
      onConnected();
    });

    _socket!.onDisconnect((_) {
      debugPrint('[Socket] ❌ Disconnected');
      onDisconnected();
    });

    _socket!.onConnectError((err) {
      debugPrint('[Socket] ⚠️  Connection error: $err');
    });

    _socket!.onError((err) {
      debugPrint('[Socket] ⚠️  Error: $err');
    });

    _socket!.on('getOnlineUsers', (data) {
      if (data is List) {
        debugPrint('[Socket] Online users: ${data.length}');
        onOnlineUsers(data.cast<String>());
      }
    });

    _socket!.on('newMessage', (data) {
      debugPrint('[Socket] 📩 newMessage received');
      if (data is Map<String, dynamic>) {
        onNewMessage(data);
      }
    });

    _socket!.on('messagesDelivered', (data) {
      debugPrint('[Socket] ✓✓ messagesDelivered');
      if (data is Map<String, dynamic>) {
        onMessagesDelivered(data);
      }
    });

    _socket!.on('messagesSeen', (data) {
      debugPrint('[Socket] 👁 messagesSeen');
      if (data is Map<String, dynamic>) {
        onMessagesSeen(data);
      }
    });

    _socket!.on('typing', (room) {
      if (room is String) onTyping(room);
    });

    _socket!.on('stop typing', (room) {
      if (room is String) onStopTyping(room);
    });

    _socket!.connect();
  }

  /// Disconnect the socket.
  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }

  /// Join a conversation room (for typing indicators).
  void joinChat(String roomId) {
    _socket?.emit('join chat', roomId);
  }

  /// Emit typing indicator.
  void emitTyping(String roomId) {
    _socket?.emit('typing', roomId);
  }

  /// Emit stop typing indicator.
  void emitStopTyping(String roomId) {
    _socket?.emit('stop typing', roomId);
  }
}
