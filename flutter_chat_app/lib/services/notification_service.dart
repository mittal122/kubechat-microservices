import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Notification service — shows local push notifications for new messages.
/// Works even when the user is not in the active chat screen.
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  /// Callback when user taps a notification.
  /// The payload is the conversationId.
  Function(String?)? onNotificationTap;

  /// Initialize the notification plugin with Android settings.
  Future<void> initialize() async {
    if (_initialized) return;

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);

    await _plugin.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        debugPrint('[Notification] Tapped: ${response.payload}');
        onNotificationTap?.call(response.payload);
      },
    );

    // Create the notification channel for Android 8.0+
    const channel = AndroidNotificationChannel(
      'kubechat_messages',
      'Messages',
      description: 'New message notifications from KubeChat',
      importance: Importance.high,
      playSound: true,
      enableVibration: true,
    );

    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // Request notification permission (Android 13+)
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();

    _initialized = true;
    debugPrint('[Notification] ✅ Initialized');
  }

  /// Show a notification for a new message.
  /// [senderName] — who sent it
  /// [messageText] — preview text
  /// [conversationId] — used as payload for tap navigation
  Future<void> showMessageNotification({
    required String senderName,
    required String messageText,
    required String conversationId,
  }) async {
    if (!_initialized) {
      debugPrint('[Notification] ⚠️ Not initialized — skipping');
      return;
    }

    // Use conversationId hashCode as notification ID so each
    // conversation gets its own notification (updated, not duplicated)
    final notifId = conversationId.hashCode;

    const androidDetails = AndroidNotificationDetails(
      'kubechat_messages',
      'Messages',
      channelDescription: 'New message notifications from KubeChat',
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      playSound: true,
      enableVibration: true,
      category: AndroidNotificationCategory.message,
      styleInformation: null, // Default style
    );

    const details = NotificationDetails(android: androidDetails);

    await _plugin.show(
      notifId,
      senderName,
      messageText,
      details,
      payload: conversationId,
    );

    debugPrint('[Notification] 🔔 Shown: $senderName — $messageText');
  }

  /// Cancel all notifications (e.g., when user opens the app).
  Future<void> cancelAll() async {
    await _plugin.cancelAll();
  }

  /// Cancel notification for a specific conversation.
  Future<void> cancelForConversation(String conversationId) async {
    await _plugin.cancel(conversationId.hashCode);
  }
}
