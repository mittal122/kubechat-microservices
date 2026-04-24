import 'package:dio/dio.dart';
import '../config/api_config.dart';
import 'storage_service.dart';

/// Dio HTTP client with automatic JWT token refresh.
/// Equivalent to React's Axios instance + interceptor in AuthContext.jsx.
class ApiService {
  static final Dio _dio = Dio(BaseOptions(
    baseUrl: ApiConfig.baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
    headers: {'Content-Type': 'application/json'},
  ));


  /// Initialize the interceptors. Call once at app startup.
  static void init({Function? onForceLogout}) {
    _dio.interceptors.clear();
    _dio.interceptors.add(
      QueuedInterceptorsWrapper(
        onRequest: (options, handler) async {
          // Attach access token to every request
          final token = await StorageService.getAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          // If access token expired and backend tells us, try refreshing
          if (error.response?.statusCode == 401 &&
              error.response?.data is Map &&
              error.response?.data['expired'] == true) {
            try {
              final refreshToken = await StorageService.getRefreshToken();
              if (refreshToken == null) {
                await StorageService.clearTokens();
                onForceLogout?.call();
                return handler.reject(error);
              }

              // Refresh the access token
              final refreshResponse = await Dio(BaseOptions(
                baseUrl: ApiConfig.baseUrl,
              )).post(ApiConfig.refresh, data: {
                'refreshToken': refreshToken,
              });

              final newAccessToken = refreshResponse.data['accessToken'];
              await StorageService.setAccessToken(newAccessToken);

              // Retry the original request with the new token
              error.requestOptions.headers['Authorization'] =
                  'Bearer $newAccessToken';
              final retryResponse = await _dio.fetch(error.requestOptions);
              return handler.resolve(retryResponse);
            } catch (e) {
              // Refresh also failed — force logout
              await StorageService.clearTokens();
              onForceLogout?.call();
              return handler.reject(error);
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  /// Get the Dio instance for making API calls.
  static Dio get dio => _dio;
}
