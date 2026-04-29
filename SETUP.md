# 🚀 KubeChat — New Device Setup Guide

> **GitHub Repo:** https://github.com/mittal122/chattining-application  
> **Stack:** Flutter (Android) + Node.js Microservices + MongoDB + Redis + Docker

---

## ✅ Prerequisites — Install These First

| Tool | Download | Purpose |
|------|----------|---------|
| **Git** | https://git-scm.com/downloads | Clone the repo |
| **Docker Desktop** | https://www.docker.com/products/docker-desktop | Run backend services |
| **Flutter SDK 3.x** | https://docs.flutter.dev/get-started/install/windows | Build the mobile app |
| **Android Studio** | https://developer.android.com/studio | Android SDK + ADB |
| **ngrok** | https://ngrok.com/download | Expose server to phone |

After installing Flutter, run `flutter doctor` and fix any issues it reports.

---

## Step 1 — Clone the Repository

```powershell
git clone https://github.com/mittal122/chattining-application.git
cd "chattining-application"
```

---

## Step 2 — Start the Backend (Docker)

Make sure **Docker Desktop is open and running**.

```powershell
docker-compose up -d
```

Wait ~30 seconds, then verify all containers are up:

```powershell
docker ps
```

Test the backend:
```powershell
curl http://localhost:5000/health
```

---

## Step 3 — Expose Backend to Phone via ngrok

Your phone can't reach `localhost` directly. ngrok creates a public HTTPS tunnel.

1. Sign up free at https://ngrok.com  
2. Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken  
3. Configure ngrok:
   ```powershell
   ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
   ```
4. Start the tunnel (keep this window open!):
   ```powershell
   ngrok http 5000
   ```
5. Copy the `https://xxx.ngrok-free.app` URL shown in the output.

---

## Step 4 — Update Flutter App URL

Open `flutter_chat_app/lib/config/api_config.dart` and replace the URL:

```dart
// Change this line:
return 'https://YOUR-NGROK-URL.ngrok-free.app';
```

> ⚠️ **Important:** ngrok gives a new URL every restart. Update this file and rebuild the APK each time.

---

## Step 5 — Build the APK

```powershell
cd flutter_chat_app
flutter pub get
flutter build apk --release
```

APK will be at:
```
flutter_chat_app\build\app\outputs\flutter-apk\app-release.apk
```

---

## Step 6 — Install APK on Phone

**Via USB (recommended):**
- Enable Developer Options → USB Debugging on your phone
- Connect via USB, then run:
  ```powershell
  flutter install
  ```

**Via file transfer:**
- Copy the APK to your phone and open it to install.

---

## Step 7 — Optional: Grafana Monitoring

Open http://localhost:3001 in your browser.  
Login: **admin / admin**  
Go to **Dashboards → KubeChat — Chat Logs**

---

## 🛑 Stop Everything

```powershell
# Stop (data preserved)
docker-compose down

# Stop + wipe all data
docker-compose down -v
```

---

## 🔧 Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot connect to Docker daemon` | Open Docker Desktop, wait for it to fully start |
| App shows "Cannot connect to server" | Check ngrok is running, URL in `api_config.dart` is updated |
| `flutter: command not found` | Add Flutter to PATH and restart terminal |
| APK build fails | Run `flutter clean` then `flutter build apk --release` |
| Messages not real-time | Ensure both phones use the same ngrok URL |
| Port 5000 already in use | In `docker-compose.yml`, change `"5000:5000"` to `"5100:5000"` |

---

## 📂 Key Files

```
chattining-application/
├── flutter_chat_app/lib/config/api_config.dart   ← ⚠️ Update ngrok URL here
├── services/api-gateway/     ← Backend entry point (port 5000)
├── services/chat-service/    ← Real-time messaging + Socket.IO
├── docker-compose.yml        ← Starts all backend services
└── SETUP.md                  ← This file
```
