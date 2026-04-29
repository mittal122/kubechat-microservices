# 🚀 KubeChat — Railway.app Production Deployment Guide

> **Free 24/7 cloud hosting — no PC needed.**  
> Railway gives you a permanent HTTPS URL. Your friends can chat even when your PC is off.

---

## 📋 What We're Deploying

```
Railway Project: "kubechat"
├── MongoDB Plugin    ← database (free)
├── Redis Plugin      ← real-time adapter (free)
├── auth-service      ← login/register
├── user-service      ← profiles, search
├── chat-service      ← messages + Socket.IO
└── api-gateway       ← public entry point ← YOUR APP URL IS HERE
```

---

## ⏱️ Total Time: ~30 minutes

---

## Step 1 — Create Railway Account

1. Go to https://railway.app
2. Click **"Start a New Project"**
3. Sign up with your **GitHub account** (important — links your repo automatically)

---

## Step 2 — Create a New Project

1. Click **"New Project"**
2. Select **"Empty Project"**
3. Name it: `kubechat`

---

## Step 3 — Add MongoDB Database

1. In your project, click **"+ New"**
2. Select **"Database"** → **"Add MongoDB"**
3. Railway auto-provisions MongoDB and gives you a connection string
4. Click on the MongoDB service → **"Variables"** tab
5. Copy the value of `MONGO_URL` — you'll need it in Step 7

---

## Step 4 — Add Redis

1. Click **"+ New"** → **"Database"** → **"Add Redis"**
2. Railway auto-provisions Redis
3. Click Redis service → **"Variables"** tab
4. Copy the value of `REDIS_URL` — you'll need it in Step 7

---

## Step 5 — Deploy auth-service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repo: `mittal122/chattining-application`
3. In **"Root Directory"**, type: `services/auth-service`
4. Railway detects the Dockerfile automatically → click **"Deploy"**
5. Wait for the green ✅ (takes 2-3 minutes)
6. Click the service → **"Settings"** → copy the **"Public URL"**
   - Example: `https://kubechat-auth.up.railway.app`

---

## Step 6 — Deploy user-service

Same as Step 5 but Root Directory = `services/user-service`

Copy its Public URL (e.g. `https://kubechat-user.up.railway.app`)

---

## Step 7 — Deploy chat-service

Same as Step 5 but Root Directory = `services/chat-service`

After deploying, click the service → **"Variables"** tab → add:

| Variable | Value |
|----------|-------|
| `MONGO_URI` | `mongodb+srv://...` (from Step 3, append `/chatApp`) |
| `JWT_SECRET` | Generate: open terminal → `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `REDIS_URL` | From Step 4 |
| `CORS_ORIGIN` | `*` |
| `NODE_ENV` | `production` |

Copy its Public URL (e.g. `https://kubechat-chat.up.railway.app`)

---

## Step 8 — Deploy api-gateway (Most Important!)

1. Click **"+ New"** → **"GitHub Repo"**
2. Root Directory = `services/api-gateway`
3. After deploying, click **"Variables"** tab → add:

| Variable | Value |
|----------|-------|
| `AUTH_SERVICE_URL` | URL from Step 5 |
| `USER_SERVICE_URL` | URL from Step 6 |
| `CHAT_SERVICE_URL` | URL from Step 7 |
| `CORS_ORIGIN` | `*` |
| `NODE_ENV` | `production` |

4. Click **"Settings"** → Enable **"Public Networking"** → copy the URL
   - This is your **FINAL APP URL** 🎉
   - Example: `https://kubechat-gateway.up.railway.app`

---

## Step 9 — Add Variables to auth-service and user-service

Click each service → **"Variables"** → add:

| Variable | Value |
|----------|-------|
| `MONGO_URI` | MongoDB URL + `/chatApp` |
| `JWT_SECRET` | **SAME secret** you used in chat-service |
| `CORS_ORIGIN` | `*` |
| `NODE_ENV` | `production` |

---

## Step 10 — Update Flutter App

Open `flutter_chat_app/lib/config/api_config.dart` and update:

```dart
static const String _productionUrl =
    'https://kubechat-gateway.up.railway.app'; // ← YOUR actual URL from Step 8
```

Then build the **production APK**:

```powershell
cd flutter_chat_app
flutter build apk --release --dart-define=ENV=production
```

The APK is at:
```
flutter_chat_app\build\app\outputs\flutter-apk\app-release.apk
```

Install it on your phone and your friend's phone.

---

## ✅ Verification

After installing the APK:
1. Register two accounts
2. Add each other as friends (QR code)
3. Send a message → it should arrive **instantly** in real time
4. Close the app → send another message → you should get a **push notification**

---

## 🔄 Updating the App in Future

When you push code changes to GitHub:
- Railway **automatically redeploys** all services (CI/CD built-in)
- Zero downtime deployment
- You only need to rebuild the APK if you change Flutter code

---

## 💰 Railway Free Tier Limits

| Resource | Free Limit | Your Usage |
|----------|-----------|------------|
| RAM | 512 MB/service | ~80-150 MB ✅ |
| CPU | Shared | Low usage ✅ |
| Hours | 500 hrs/month | ~720 hrs needed ⚠️ |
| Bandwidth | 100 GB | Low ✅ |

> **Note:** Free tier gives 500 hours/month. With 4 services, that's ~125 hours each.  
> For 24/7 operation (720 hrs), upgrade to **Hobby plan ($5/month)** which gives unlimited hours.

---

## 🛑 Emergency: Rollback

If something breaks after a code push:
1. Railway Dashboard → Service → **"Deployments"**
2. Click any previous deployment → **"Redeploy"**
3. Instantly rolls back ✅

---

*After completing this guide, your app will be live at `https://kubechat-gateway.up.railway.app` permanently.*
