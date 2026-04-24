import 'dart:io' show Platform;

/// API configuration — all backend endpoints and base URL.
///
/// Mirrors the React app's API_URL from AuthContext.jsx.
/// The base URL auto-detects the platform:
///   - Windows/macOS/Linux desktop → localhost
///   - Android emulator           → 10.0.2.2 (Android's alias for host machine)
///   - Real device (iOS/Android)  → set your machine's LAN IP below
class ApiConfig {
  // ── Base URL (auto-detected by platform) ──
  // For real devices on your WiFi, change _lanIp to your PC's local IP
  // (e.g., 192.168.1.5). Find it with: ipconfig (Windows) or ifconfig (Mac).
  static const String _lanIp = '192.168.1.105'; // Updated to match your Wi-Fi IP
  static const String _port = '5000';

  static String get baseUrl {
    try {
      if (Platform.isAndroid || Platform.isIOS) {
        // Use localhost via ADB reverse tunnel to bypass Windows Firewall
        return 'http://127.0.0.1:$_port';
      }
    } catch (_) {
      // Platform detection may fail on web — fallback to localhost
    }
    // Desktop (Windows, macOS, Linux) or fallback
    return 'http://localhost:$_port';
  }

  // ── Auth Endpoints ──
  static const String login = '/api/auth/login';
  static const String register = '/api/auth/register';
  static const String refresh = '/api/auth/refresh';
  static const String logout = '/api/auth/logout';
  static const String me = '/api/auth/me';

  // ── User Endpoints ──
  static const String users = '/api/users';
  static const String searchUsers = '/api/users/search';

  // ── Conversation Endpoints ──
  static const String conversations = '/api/conversations';

  // ── Message Endpoints ──
  /// POST /api/messages/:receiverId — send message
  /// GET  /api/messages/:conversationId — fetch history
  /// PUT  /api/messages/:conversationId/seen — mark seen
  static const String messages = '/api/messages';
}
