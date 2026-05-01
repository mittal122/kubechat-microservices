import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
import '../services/storage_service.dart';

/// Auth state management — equivalent to React's AuthContext + AuthProvider.
class AuthProvider extends ChangeNotifier {
  UserModel? _user;
  bool _loading = true;

  UserModel? get user => _user;
  bool get loading => _loading;
  bool get isAuthenticated => _user != null;

  /// Check if user is already logged in (on app startup).
  Future<void> checkAuthStatus() async {
    _loading = true;
    notifyListeners();

    final accessToken = await StorageService.getAccessToken();
    if (accessToken == null) {
      _loading = false;
      notifyListeners();
      return;
    }

    try {
      _user = await AuthService.getMe();
    } catch (e) {
      debugPrint('Auth verification failed: $e');
      await StorageService.clearTokens();
      _user = null;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Login with email and password.
  Future<String?> login(String email, String password) async {
    try {
      _user = await AuthService.login(email, password);
      notifyListeners();
      return null; // null = no error
    } catch (e) {
      if (e is DioException && e.response != null) {
        return e.response?.data['message'] ?? 'Login failed. Please try again.';
      }
      return 'Login failed. Please try again.';
    }
  }

  /// Register a new account.
  Future<String?> register(String name, String email, String password) async {
    try {
      _user = await AuthService.register(name, email, password);
      notifyListeners();
      return null;
    } catch (e) {
      if (e is DioException && e.response != null) {
        return e.response?.data['message'] ??
            'Registration failed. Please try again.';
      }
      return 'Registration failed. Please try again.';
    }
  }

  /// Logout the current user — always clears local state even if API fails.
  Future<void> logout() async {
    try {
      await AuthService.logout();
    } catch (e) {
      debugPrint('Logout API error (ignored): $e');
    } finally {
      await StorageService.clearTokens();
      _user = null;
      notifyListeners();
    }
  }

  /// Force logout (called by API interceptor when refresh fails).
  void forceLogout() {
    _user = null;
    notifyListeners();
  }
}
