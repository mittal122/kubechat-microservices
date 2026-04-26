import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../config/app_theme.dart';
import '../models/conversation_model.dart';
import '../models/user_model.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../services/chat_service.dart';
import 'chat_window.dart';

/// Privacy-first friend discovery tab.
/// Users connect via unique codes or QR scanning — no open search.
class DiscoverTab extends StatefulWidget {
  const DiscoverTab({super.key});

  @override
  State<DiscoverTab> createState() => _DiscoverTabState();
}

class _DiscoverTabState extends State<DiscoverTab> {
  final _codeController = TextEditingController();
  UserModel? _foundUser;
  bool _isSearching = false;
  String? _searchError;
  bool _codeCopied = false;
  bool _showMyQR = false;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _lookupCode() async {
    final code = _codeController.text.trim().toUpperCase();
    if (code.isEmpty) return;

    setState(() {
      _isSearching = true;
      _searchError = null;
      _foundUser = null;
    });

    try {
      final user = await ChatService.findUserByCode(code);
      setState(() {
        _isSearching = false;
        if (user != null) {
          _foundUser = user;
        } else {
          _searchError = 'No user found with this code';
        }
      });
    } catch (e) {
      setState(() {
        _isSearching = false;
        _searchError = 'Failed to look up code. Try again.';
      });
    }
  }

  void _startChat(UserModel user) {
    final chatProvider = context.read<ChatProvider>();
    final auth = context.read<AuthProvider>();
    final existing = chatProvider.conversations.where(
      (c) => c.otherUser.id == user.id,
    );

    if (existing.isNotEmpty) {
      chatProvider.setActiveConversation(existing.first);
    } else {
      chatProvider.setActiveConversation(ConversationModel.newChat(user));
    }

    // Clear search state
    _codeController.clear();
    setState(() {
      _foundUser = null;
      _searchError = null;
    });

    // Push ChatWindow directly
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatWindow(currentUserId: auth.user!.id),
      ),
    );
  }

  void _openQRScanner() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _QRScannerScreen(
          onCodeScanned: (code) {
            Navigator.of(context).pop();
            _codeController.text = code;
            _lookupCode();
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final myCode = auth.user?.connectCode ?? '???-????';

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Text(
              'Connect',
              style: AppTheme.headingLarge.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 6),
            Text(
              'Share your code or scan to connect privately',
              style: AppTheme.bodySmall,
            ),
            const SizedBox(height: 28),

            // ── MY CODE SECTION ──
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(AppTheme.radiusXL),
                border: Border.all(color: AppTheme.primary.withAlpha(40)),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.primary.withAlpha(10),
                    blurRadius: 20,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: Column(
                children: [
                  Text(
                    'YOUR CONNECT CODE',
                    style: AppTheme.labelSmall.copyWith(
                      color: AppTheme.primary,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Toggle between code and QR
                  if (_showMyQR) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusMedium),
                      ),
                      child: QrImageView(
                        data: myCode,
                        version: QrVersions.auto,
                        size: 160,
                        backgroundColor: Colors.white,
                        eyeStyle: const QrEyeStyle(
                          eyeShape: QrEyeShape.square,
                          color: Color(0xFF0B0D17),
                        ),
                        dataModuleStyle: const QrDataModuleStyle(
                          dataModuleShape: QrDataModuleShape.square,
                          color: Color(0xFF0B0D17),
                        ),
                      ),
                    ),
                  ] else ...[
                    Text(myCode, style: AppTheme.codeStyle),
                  ],
                  const SizedBox(height: 18),

                  // Action buttons
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _buildActionChip(
                        icon: _codeCopied ? Icons.check : Icons.copy_rounded,
                        label: _codeCopied ? 'Copied!' : 'Copy',
                        isActive: _codeCopied,
                        onTap: () {
                          Clipboard.setData(ClipboardData(text: myCode));
                          setState(() => _codeCopied = true);
                          Future.delayed(const Duration(seconds: 2), () {
                            if (mounted) setState(() => _codeCopied = false);
                          });
                        },
                      ),
                      const SizedBox(width: 10),
                      _buildActionChip(
                        icon: Icons.share_rounded,
                        label: 'Share',
                        onTap: () {
                          Share.share(
                            'Connect with me on KubeChat! My code: $myCode',
                          );
                        },
                      ),
                      const SizedBox(width: 10),
                      _buildActionChip(
                        icon: _showMyQR
                            ? Icons.pin_rounded
                            : Icons.qr_code_rounded,
                        label: _showMyQR ? 'Code' : 'QR',
                        onTap: () =>
                            setState(() => _showMyQR = !_showMyQR),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),

            // ── ENTER FRIEND'S CODE ──
            Text(
              'ENTER FRIEND\'S CODE',
              style: AppTheme.labelSmall.copyWith(
                letterSpacing: 1.5,
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _codeController,
                    textCapitalization: TextCapitalization.characters,
                    style: AppTheme.bodyMedium.copyWith(
                      letterSpacing: 2,
                      fontWeight: FontWeight.w600,
                    ),
                    decoration: InputDecoration(
                      hintText: 'XXX-XXXX',
                      hintStyle: AppTheme.bodyMedium.copyWith(
                        color: AppTheme.textFaint,
                        letterSpacing: 2,
                      ),
                      prefixIcon: const Icon(Icons.tag_rounded,
                          size: 20, color: AppTheme.textMuted),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                    ),
                    onSubmitted: (_) => _lookupCode(),
                  ),
                ),
                const SizedBox(width: 10),
                GestureDetector(
                  onTap: _isSearching ? null : _lookupCode,
                  child: Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMedium),
                    ),
                    child: _isSearching
                        ? const Center(
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: AppTheme.background,
                                strokeWidth: 2,
                              ),
                            ),
                          )
                        : const Icon(Icons.search_rounded,
                            color: AppTheme.background, size: 22),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Search result
            if (_searchError != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.error.withAlpha(15),
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  border: Border.all(color: AppTheme.error.withAlpha(50)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded,
                        size: 16, color: AppTheme.error),
                    const SizedBox(width: 8),
                    Text(
                      _searchError!,
                      style:
                          AppTheme.bodySmall.copyWith(color: AppTheme.error),
                    ),
                  ],
                ),
              ),

            if (_foundUser != null) _buildFoundUserCard(_foundUser!),

            const SizedBox(height: 24),

            // ── SCAN QR CODE ──
            GestureDetector(
              onTap: _openQRScanner,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppTheme.surfaceLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                  border: Border.all(color: AppTheme.border),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withAlpha(20),
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusMedium),
                      ),
                      child: const Icon(Icons.qr_code_scanner_rounded,
                          color: AppTheme.primary, size: 22),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Scan QR Code',
                            style: AppTheme.bodyMedium.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Point your camera at a friend\'s QR code',
                            style: AppTheme.bodySmall
                                .copyWith(color: AppTheme.textMuted),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded,
                        color: AppTheme.textMuted, size: 20),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionChip({
    required IconData icon,
    required String label,
    bool isActive = false,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isActive
              ? AppTheme.primary.withAlpha(25)
              : AppTheme.surfaceLight,
          borderRadius: BorderRadius.circular(AppTheme.radiusPill),
          border: Border.all(
            color: isActive
                ? AppTheme.primary.withAlpha(75)
                : AppTheme.border,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 14,
                color:
                    isActive ? AppTheme.primary : AppTheme.textSecondary),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppTheme.bodySmall.copyWith(
                color:
                    isActive ? AppTheme.primary : AppTheme.textSecondary,
                fontWeight: FontWeight.w500,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFoundUserCard(UserModel user) {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        border: Border.all(color: AppTheme.primary.withAlpha(50)),
      ),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 50,
            height: 50,
            decoration: const BoxDecoration(
              gradient: AppTheme.primaryGradient,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
              style: AppTheme.headingSmall.copyWith(
                color: AppTheme.background,
                fontSize: 20,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.name,
                  style: AppTheme.bodyMedium.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  user.email,
                  style: AppTheme.bodySmall.copyWith(
                    color: AppTheme.textMuted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => _startChat(user),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(AppTheme.radiusPill),
              ),
              child: Text(
                'Message',
                style: AppTheme.bodySmall.copyWith(
                  color: AppTheme.background,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-screen QR code scanner
class _QRScannerScreen extends StatefulWidget {
  final Function(String) onCodeScanned;

  const _QRScannerScreen({required this.onCodeScanned});

  @override
  State<_QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<_QRScannerScreen> {
  final MobileScannerController _controller = MobileScannerController();
  bool _hasScanned = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close_rounded, color: AppTheme.textPrimary),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text('Scan QR Code', style: AppTheme.headingSmall),
        centerTitle: true,
      ),
      body: Column(
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppTheme.radiusXL),
              child: MobileScanner(
                controller: _controller,
                onDetect: (capture) {
                  if (_hasScanned) return;
                  final barcodes = capture.barcodes;
                  if (barcodes.isNotEmpty && barcodes.first.rawValue != null) {
                    _hasScanned = true;
                    widget.onCodeScanned(barcodes.first.rawValue!);
                  }
                },
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Point your camera at a friend\'s\nKubeChat QR code',
              textAlign: TextAlign.center,
              style: AppTheme.bodySmall.copyWith(
                color: AppTheme.textMuted,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
