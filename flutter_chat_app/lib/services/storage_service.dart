import 'package:shared_preferences/shared_preferences.dart';

/// Persistent token storage using SharedPreferences.
/// Equivalent to React's localStorage for accessToken/refreshToken.
///
/// Caches the SharedPreferences instance to avoid opening it on every call.
class StorageService {
  static const _accessTokenKey = 'accessToken';
  static const _refreshTokenKey = 'refreshToken';

  /// Cached SharedPreferences instance — avoids repeated async lookups.
  static SharedPreferences? _prefs;

  /// Get or create the cached SharedPreferences instance.
  static Future<SharedPreferences> get _instance async {
    _prefs ??= await SharedPreferences.getInstance();
    return _prefs!;
  }

  // ── Access Token ──
  static Future<String?> getAccessToken() async {
    final prefs = await _instance;
    return prefs.getString(_accessTokenKey);
  }

  static Future<void> setAccessToken(String token) async {
    final prefs = await _instance;
    await prefs.setString(_accessTokenKey, token);
  }

  // ── Refresh Token ──
  static Future<String?> getRefreshToken() async {
    final prefs = await _instance;
    return prefs.getString(_refreshTokenKey);
  }

  static Future<void> setRefreshToken(String token) async {
    final prefs = await _instance;
    await prefs.setString(_refreshTokenKey, token);
  }

  // ── Save both tokens at once ──
  static Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    final prefs = await _instance;
    await prefs.setString(_accessTokenKey, accessToken);
    await prefs.setString(_refreshTokenKey, refreshToken);
  }

  // ── Clear all tokens (logout) ──
  static Future<void> clearTokens() async {
    final prefs = await _instance;
    await prefs.remove(_accessTokenKey);
    await prefs.remove(_refreshTokenKey);
  }
}
