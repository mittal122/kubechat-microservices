import 'package:flutter/material.dart';
import '../services/socket_service.dart';

/// Socket state management — equivalent to React's SocketContext.
class SocketProvider extends ChangeNotifier {
  final SocketService _socketService = SocketService();

  List<String> _onlineUsers = [];
  bool _isConnected = false;

  // Callbacks for events that other providers/widgets need to handle
  Function(Map<String, dynamic>)? onNewMessage;
  Function(Map<String, dynamic>)? onMessagesDelivered;
  Function(Map<String, dynamic>)? onMessagesSeen;
  Function(String)? onTyping;
  Function(String)? onStopTyping;

  List<String> get onlineUsers => _onlineUsers;
  bool get isConnected => _isConnected;
  SocketService get service => _socketService;

  /// Connect to Socket.IO server.
  Future<void> connect() async {
    await _socketService.connect(
      onOnlineUsers: (users) {
        _onlineUsers = users;
        notifyListeners();
      },
      onNewMessage: (data) {
        onNewMessage?.call(data);
      },
      onMessagesDelivered: (data) {
        onMessagesDelivered?.call(data);
      },
      onMessagesSeen: (data) {
        onMessagesSeen?.call(data);
      },
      onTyping: (room) {
        onTyping?.call(room);
      },
      onStopTyping: (room) {
        onStopTyping?.call(room);
      },
      onConnected: () {
        _isConnected = true;
        notifyListeners();
      },
      onDisconnected: () {
        _isConnected = false;
        notifyListeners();
      },
    );
  }

  /// Disconnect from Socket.IO server.
  void disconnect() {
    _socketService.disconnect();
    _onlineUsers = [];
    _isConnected = false;
    notifyListeners();
  }

  /// Check if a user is online.
  bool isUserOnline(String userId) => _onlineUsers.contains(userId);

  @override
  void dispose() {
    _socketService.disconnect();
    super.dispose();
  }
}
