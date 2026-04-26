import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/server_health_provider.dart';

/// Compact server status indicator — teal dot for online, red for offline.
class ServerStatusIndicator extends StatelessWidget {
  const ServerStatusIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<ServerHealthProvider>(
      builder: (context, health, _) {
        final isOnline = health.isOnline;
        final label = health.statusLabel;

        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: isOnline
                ? AppTheme.online.withAlpha(15)
                : AppTheme.error.withAlpha(15),
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
            border: Border.all(
              color: isOnline
                  ? AppTheme.online.withAlpha(50)
                  : AppTheme.error.withAlpha(50),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  color: isOnline ? AppTheme.online : AppTheme.error,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: (isOnline ? AppTheme.online : AppTheme.error)
                          .withAlpha(100),
                      blurRadius: 6,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: AppTheme.labelSmall.copyWith(
                  fontSize: 10,
                  color: isOnline ? AppTheme.online : AppTheme.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
