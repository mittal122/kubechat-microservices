# Flutter App — Bug Tracker

**Total: 9 bugs** (2 Critical, 4 Medium, 3 Low)
**Fixed: 8 / 9**

---

## 🔴 Critical

### BUG-01: Not mobile-ready — missing platform folders
- **File:** Project root (`flutter_chat_app/`)
- **Issue:** Only `windows/` platform folder exists. No `android/` or `ios/` folders.
- **Impact:** App cannot be built or run on any mobile device.
- **Fix:** Run `flutter create --platforms=android,ios .`
- **Status:** [x] Fixed

### BUG-02: Hardcoded localhost API URL
- **File:** `lib/config/api_config.dart:8`
- **Issue:** `baseUrl = 'http://localhost:5000'` — mobile phones cannot reach localhost.
- **Impact:** App will connection-timeout on every API call when run on mobile.
- **Fix:** Make URL configurable with environment-aware defaults (localhost for desktop, 10.0.2.2 for Android emulator, machine IP for real devices).
- **Status:** [x] Fixed

---

## 🟡 Medium

### BUG-03: Force-unwrap user during socket events → crash risk
- **File:** `lib/screens/chat_screen.dart:43, 47, 53, 58`
- **Issue:** `auth.user!.id` — force-unwraps user. If a socket event fires while user is logging out (user becomes null), the app will crash with `Null check operator used on a null value`.
- **Impact:** Rare but fatal crash during logout while socket events are in-flight.
- **Fix:** Add null guard: `if (auth.user == null) return;`
- **Status:** [x] Fixed

### BUG-04: WebSocket transport-only — no polling fallback
- **File:** `lib/services/socket_service.dart:30`
- **Issue:** `.setTransports(['websocket'])` skips HTTP long-polling. If WebSocket connections are blocked (corporate firewall, restrictive proxy), Socket.IO cannot fall back to polling.
- **Impact:** Connection silently fails in restrictive network environments.
- **Fix:** Use `['polling', 'websocket']` to allow fallback.
- **Status:** [x] Fixed

### BUG-05: SharedPreferences opened repeatedly — performance waste
- **File:** `lib/services/storage_service.dart`
- **Issue:** Every token read/write calls `SharedPreferences.getInstance()` — creating a new instance each time.  There are 6 methods that each open a fresh instance.
- **Impact:** Unnecessary async overhead on every API call (interceptor calls `getAccessToken()` before every request).
- **Fix:** Cache the `SharedPreferences` instance as a static field.
- **Status:** [x] Fixed

### BUG-06: Mutable message model state — fragile updates
- **File:** `lib/models/message_model.dart:9-10`, `lib/providers/chat_provider.dart:97-98`
- **Issue:** `status` and `isSeen` are mutable fields modified directly. Provider listeners trigger from `notifyListeners()` but the object reference hasn't changed, so widget rebuilds may miss updates.
- **Impact:** Seen/delivered status indicators may not update in the UI in some edge cases.
- **Fix:** Use `copyWith()` pattern for immutable state updates.
- **Status:** [x] Fixed

---

## 🟢 Low

### BUG-07: Deprecated `withOpacity()` usage
- **File:** `lib/screens/chat_screen.dart:82, 117, 118, 231`
- **Issue:** `Color.withOpacity()` is deprecated in Flutter 3.27+. Should use `Color.withValues(alpha:)`.
- **Impact:** Deprecation warnings during build. Will break in future Flutter versions.
- **Fix:** Replace all `withOpacity(x)` with `withValues(alpha: x)`.
- **Status:** [ ] Not Fixed

### BUG-08: No error UI for network failures
- **Files:** `lib/providers/auth_provider.dart`, `lib/providers/chat_provider.dart`
- **Issue:** Network errors are caught and sent to `debugPrint()` but user sees nothing — no toast, no snackbar, no error dialog.
- **Impact:** If backend is down, user sees empty screens with no explanation.
- **Fix:** Add a SnackBar or error banner for failed API calls.
- **Status:** [x] Fixed

### BUG-09: No message pagination — loads all messages at once
- **File:** `lib/services/chat_service.dart:21-22`
- **Issue:** `getMessages()` loads the entire chat history in one API call. No pagination, no lazy loading.
- **Impact:** Long conversations (1000+ messages) will cause UI lag and high memory usage.
- **Fix:** Add `?page=1&limit=50` query params with infinite scroll.
- **Status:** [x] Fixed
