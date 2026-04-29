/// API configuration — all backend endpoints and base URL.
///
/// HOW TO SWITCH ENVIRONMENTS:
///
/// Local development (Docker on your PC):
///   flutter run --dart-define=ENV=local
///
/// Production (Railway cloud):
///   flutter run --dart-define=ENV=production
///   flutter build apk --release --dart-define=ENV=production
///
/// If no ENV is set, defaults to production.
class ApiConfig {
  // ── Environment URLs ──────────────────────────────────────────
  // Change PRODUCTION_URL after you deploy to Railway:
  static const String _productionUrl =
      'https://kubechat-gateway.up.railway.app'; // ← update after Railway deploy

  // Your local ngrok URL (for testing on your own PC):
  static const String _localUrl =
      'https://guileless-blinkingly-ezra.ngrok-free.dev';

  // Reads the --dart-define=ENV=... build flag
  static const String _env =
      String.fromEnvironment('ENV', defaultValue: 'production');

  static String get baseUrl =>
      _env == 'local' ? _localUrl : _productionUrl;

  // ── Auth Endpoints ──
  static const String login = '/api/auth/login';
  static const String register = '/api/auth/register';
  static const String refresh = '/api/auth/refresh';
  static const String logout = '/api/auth/logout';
  static const String me = '/api/auth/me';

  // ── User Endpoints ──
  static const String users = '/api/users';
  static const String searchUsers = '/api/users/search';
  static const String findByCode = '/api/users/code';

  // ── Conversation Endpoints ──
  static const String conversations = '/api/conversations';

  // ── Message Endpoints ──
  static const String messages = '/api/messages';
}
