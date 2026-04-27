import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../config/api_config.dart';
import 'storage_service.dart';

/// Socket.IO service — manages WebSocket connection with JWT authentication.
class SocketService {
  IO.Socket? _socket;

  IO.Socket? get socket => _socket;
  bool get isConnected => _socket?.connected ?? false;

  /// Safely convert any Map to Map<String, dynamic>.
  /// Socket.IO client can send data as Map<dynamic, dynamic>,
  /// Map<String, Object?>, or other subtypes — all of which
  /// FAIL the `is Map<String, dynamic>` type check and cause
  /// messages to be silently dropped.
  Map<String, dynamic>? _toMap(dynamic data) {
    if (data == null) return null;
    if (data is Map) {
      try {
        return Map<String, dynamic>.from(data);
      } catch (e) {
        debugPrint('[Socket] ⚠️ Map conversion failed: $e');
        return null;
      }
    }
    debugPrint('[Socket] ⚠️ Expected Map but got ${data.runtimeType}');
    return null;
  }

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
          .setTransports(['polling', 'websocket'])
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

    // ── Online users (List<String>) ──
    _socket!.on('getOnlineUsers', (data) {
      debugPrint('[Socket] Online users update: ${data?.runtimeType}');
      if (data is List) {
        final users = List<String>.from(data.map((e) => e.toString()));
        debugPrint('[Socket] Online users count: ${users.length}');
        onOnlineUsers(users);
      }
    });

    // ── New message ──
    // CRITICAL FIX: Use _toMap() instead of `is Map<String, dynamic>`.
    // Socket.IO Dart client often sends data as Map<dynamic, dynamic>
    // which FAILS the strict type check, silently dropping every message.
    _socket!.on('newMessage', (data) {
      debugPrint('[Socket] 📩 newMessage raw type: ${data?.runtimeType}');
      final map = _toMap(data);
      if (map != null) {
        debugPrint('[Socket] 📩 newMessage parsed — text: ${map['text']?.toString().substring(0, (map['text']?.toString().length ?? 0).clamp(0, 30))}');
        onNewMessage(map);
      } else {
        debugPrint('[Socket] ❌ newMessage DROPPED — could not parse: $data');
      }
    });

    // ── Messages delivered ──
    _socket!.on('messagesDelivered', (data) {
      debugPrint('[Socket] ✓✓ messagesDelivered raw type: ${data?.runtimeType}');
      final map = _toMap(data);
      if (map != null) {
        onMessagesDelivered(map);
      }
    });

    // ── Messages seen ──
    _socket!.on('messagesSeen', (data) {
      debugPrint('[Socket] 👁 messagesSeen raw type: ${data?.runtimeType}');
      final map = _toMap(data);
      if (map != null) {
        onMessagesSeen(map);
      }
    });

    // ── Typing indicators ──
    _socket!.on('typing', (room) {
      if (room != null) onTyping(room.toString());
    });

    _socket!.on('stop typing', (room) {
      if (room != null) onStopTyping(room.toString());
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
