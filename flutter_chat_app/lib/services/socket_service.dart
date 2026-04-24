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
    final token = await StorageService.getAccessToken();
    if (token == null) return;

    _socket = IO.io(
      ApiConfig.baseUrl,
      IO.OptionBuilder()
          .setTransports(['polling', 'websocket']) // Allow polling fallback if WS blocked
          .setAuth({'token': token}) // Maps to socket.handshake.auth.token
          .disableAutoConnect()
          .enableReconnection()
          .build(),
    );

    _socket!.onConnect((_) => onConnected());
    _socket!.onDisconnect((_) => onDisconnected());

    _socket!.on('getOnlineUsers', (data) {
      if (data is List) {
        onOnlineUsers(data.cast<String>());
      }
    });

    _socket!.on('newMessage', (data) {
      if (data is Map<String, dynamic>) {
        onNewMessage(data);
      }
    });

    _socket!.on('messagesDelivered', (data) {
      if (data is Map<String, dynamic>) {
        onMessagesDelivered(data);
      }
    });

    _socket!.on('messagesSeen', (data) {
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
