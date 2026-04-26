import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../config/api_config.dart';

/// Pings the backend every 10 seconds to determine if the server is reachable.
/// Uses a SEPARATE Dio instance to avoid interference with the auth interceptor.
class ServerHealthProvider extends ChangeNotifier {
  bool _isOnline = false; // Start pessimistic — assume offline until proven
  bool _isChecking = false;
  Timer? _timer;
  String _lastError = '';

  // Dedicated Dio instance for health checks — no interceptors, short timeout
  final Dio _healthDio = Dio(BaseOptions(
    baseUrl: ApiConfig.baseUrl,
    connectTimeout: const Duration(seconds: 5),
    receiveTimeout: const Duration(seconds: 5),
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
  ));

  bool get isOnline => _isOnline;
  String get lastError => _lastError;
  String get statusLabel {
    if (_isOnline) return 'Online';
    if (_lastError.isNotEmpty) return _lastError;
    return 'Offline';
  }

  void startChecking() {
    if (_timer != null) return;
    _checkHealth(); // Check immediately on startup
    _timer = Timer.periodic(const Duration(seconds: 10), (_) {
      _checkHealth();
    });
  }

  void stopChecking() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> _checkHealth() async {
    if (_isChecking) return;
    _isChecking = true;

    try {
      await _healthDio.get('/');
      // Any successful response (2xx) means server is reachable
      _setOnline(true, '');
    } on DioException catch (e) {
      if (e.response != null) {
        // We got a response back (even 404, 500, etc.) — server IS reachable
        final body = e.response?.data?.toString() ?? '';
        // Check if ngrok returned its "offline" error page
        if (body.contains('ERR_NGROK') || body.contains('ngrok')) {
          _setOnline(false, 'Ngrok tunnel offline');
        } else {
          // Any other HTTP error (404, 401, 500) means the server IS responding
          _setOnline(true, '');
        }
      } else {
        // No response at all — connection refused, timeout, DNS failure
        _setOnline(false, e.message ?? 'Connection failed');
      }
    } catch (e) {
      _setOnline(false, e.toString());
    } finally {
      _isChecking = false;
    }
  }

  void _setOnline(bool online, String error) {
    if (_isOnline != online || _lastError != error) {
      _isOnline = online;
      _lastError = error;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    stopChecking();
    _healthDio.close();
    super.dispose();
  }
}
