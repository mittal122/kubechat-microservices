import 'package:dio/dio.dart';
import '../config/api_config.dart';
import '../models/user_model.dart';
import 'api_service.dart';
import 'storage_service.dart';

/// Authentication service — handles all auth API calls.
/// Equivalent to React's login/register/logout functions in AuthContext.jsx.
class AuthService {
  static Dio get _dio => ApiService.dio;

  /// Login with email and password.
  /// Returns the user on success, throws on failure.
  static Future<UserModel> login(String email, String password) async {
    final response = await _dio.post(ApiConfig.login, data: {
      'email': email,
      'password': password,
    });

    await StorageService.saveTokens(
      accessToken: response.data['accessToken'],
      refreshToken: response.data['refreshToken'],
    );

    return UserModel.fromJson(response.data);
  }

  /// Register a new user.
  static Future<UserModel> register(
      String name, String email, String password) async {
    final response = await _dio.post(ApiConfig.register, data: {
      'name': name,
      'email': email,
      'password': password,
    });

    await StorageService.saveTokens(
      accessToken: response.data['accessToken'],
      refreshToken: response.data['refreshToken'],
    );

    return UserModel.fromJson(response.data);
  }

  /// Get the currently authenticated user.
  static Future<UserModel> getMe() async {
    final response = await _dio.get(ApiConfig.me);
    return UserModel.fromJson(response.data);
  }

  /// Logout — clears refresh token from server and local storage.
  static Future<void> logout() async {
    try {
      await _dio.post(ApiConfig.logout);
    } catch (_) {
      // Server logout failed, but still clear local tokens
    } finally {
      await StorageService.clearTokens();
    }
  }
}
