/// API configuration — all backend endpoints and base URL.
class ApiConfig {
  static String get baseUrl {
    return 'https://guileless-blinkingly-ezra.ngrok-free.dev';
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
  static const String findByCode = '/api/users/code'; // GET /api/users/code/:code

  // ── Conversation Endpoints ──
  static const String conversations = '/api/conversations';

  // ── Message Endpoints ──
  static const String messages = '/api/messages';
}
