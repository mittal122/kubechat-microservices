# 🚀 KubeChat — Render.com Deployment Guide (FREE)

> **Render.com free tier:** 750 hours/month per service — perfect for personal use.  
> No credit card required.

---

## What We Need (All Free)

| Service | Where | Cost |
|---------|-------|------|
| MongoDB database | MongoDB Atlas | FREE (512MB) |
| Redis | Upstash Redis | FREE (10k req/day) |
| 4 backend services | Render.com | FREE (750hrs/month each) |

**Total cost: $0**

---

## PART 1 — MongoDB Atlas (5 minutes)

### Step 1 — Create Atlas account
1. Go to https://www.mongodb.com/atlas
2. Click **"Try Free"** → sign up with Google or email

### Step 2 — Create a free cluster
1. Click **"Build a Database"**
2. Select **"M0 FREE"** (the free tier)
3. Choose any region close to you (e.g., AWS Mumbai)
4. Click **"Create"**

### Step 3 — Create database user
1. When prompted, set a username and password
   - Username: `kubechat`
   - Password: make something strong (no special chars like @ / !)
   - **Save this password in Notepad**
2. Click **"Create User"**

### Step 4 — Allow all IPs
1. Under "Where would you like to connect from?" → select **"My Local Environment"**
2. In the IP field, type: `0.0.0.0/0` → click **"Add Entry"**
3. Click **"Finish and Close"**

### Step 5 — Get your connection string
1. Click **"Connect"** on your cluster
2. Select **"Drivers"**
3. Copy the connection string — it looks like:
   ```
   mongodb+srv://kubechat:<password>@cluster0.xxxxx.mongodb.net/
   ```
4. Replace `<password>` with your actual password
5. Add `chatApp` at the end:
   ```
   mongodb+srv://kubechat:YOURPASSWORD@cluster0.xxxxx.mongodb.net/chatApp
   ```
6. **Save this full string in Notepad** — this is your `MONGO_URI`

---

## PART 2 — Upstash Redis (2 minutes)

### Step 1 — Create account
1. Go to https://upstash.com
2. Click **"Start for Free"** → sign up with GitHub

### Step 2 — Create Redis database
1. Click **"Create Database"**
2. Name: `kubechat-redis`
3. Region: pick closest to you
4. Click **"Create"**

### Step 3 — Get connection URL
1. Click on your database
2. Scroll down to **"REST API"** section
3. Find **"UPSTASH_REDIS_REST_URL"** — BUT we need the Redis URL, not REST
4. Scroll to **"Connect"** section → find:
   ```
   redis://:PASSWORD@HOST:PORT
   ```
5. **Save this as your `REDIS_URL`**

---

## PART 3 — Deploy on Render.com (10 minutes)

### Step 1 — Create account
1. Go to https://render.com
2. Click **"Get Started for Free"** → sign up with **GitHub**

### Step 2 — Deploy auth-service FIRST
1. Click **"New +"** → **"Web Service"**
2. Connect GitHub → select repo: `mittal122/kubechat-microservices`
3. Fill in:
   - **Name:** `kubechat-auth`
   - **Root Directory:** `services/auth-service`
   - **Environment:** `Docker`
   - **Plan:** Free
4. Click **"Advanced"** → add environment variables:

| Key | Value |
|-----|-------|
| `MONGO_URI` | your MongoDB Atlas URL from Part 1 |
| `JWT_SECRET` | `2c1575d2bba5e21c5554d09a03f365e72f75fd8736626b42a6d2461d40b2fbc46eaa9ef29497818f247ca48e0c2e7a0dfdc624e501c30433fdcfebf3062ef61c` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `*` |

5. Click **"Create Web Service"**
6. Wait for green **"Live"** status (~3-5 mins)
7. **Copy the URL** shown at top: `https://kubechat-auth.onrender.com`

---

### Step 3 — Deploy user-service
Same as Step 2 but:
- **Name:** `kubechat-user`
- **Root Directory:** `services/user-service`
- Same environment variables as auth-service

Copy URL: `https://kubechat-user.onrender.com`

---

### Step 4 — Deploy chat-service
Same but:
- **Name:** `kubechat-chat`
- **Root Directory:** `services/chat-service`
- Environment variables:

| Key | Value |
|-----|-------|
| `MONGO_URI` | your MongoDB Atlas URL |
| `JWT_SECRET` | same secret as above |
| `REDIS_URL` | your Upstash Redis URL from Part 2 |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `*` |

Copy URL: `https://kubechat-chat.onrender.com`

---

### Step 5 — Deploy api-gateway (LAST)
Same but:
- **Name:** `kubechat-gateway`
- **Root Directory:** `services/api-gateway`
- Environment variables:

| Key | Value |
|-----|-------|
| `AUTH_SERVICE_URL` | `https://kubechat-auth.onrender.com` |
| `USER_SERVICE_URL` | `https://kubechat-user.onrender.com` |
| `CHAT_SERVICE_URL` | `https://kubechat-chat.onrender.com` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `*` |

**Your final app URL:** `https://kubechat-gateway.onrender.com` 🎉

---

## PART 4 — Update Flutter App

Open `flutter_chat_app/lib/config/api_config.dart` and update:

```dart
static const String _productionUrl =
    'https://kubechat-gateway.onrender.com'; // ← your Render URL
```

Build production APK:
```powershell
cd flutter_chat_app
flutter build apk --release --dart-define=ENV=production
```

---

## ⚠️ Important: Free Tier Spin-Down

Render free services **go to sleep after 15 minutes of no traffic**.  
First request after sleep takes **30-60 seconds** to wake up.

**Fix:** Keep services awake with a free uptime monitor:
- Go to https://uptimerobot.com (free)
- Add monitor for: `https://kubechat-gateway.onrender.com/health`
- Set interval: every 5 minutes
- This prevents spin-down completely ✅

---

## ✅ Verification

After deploying:
1. Visit: `https://kubechat-gateway.onrender.com/health`
2. Should return: `{"status":"healthy",...}`
3. Install APK → register → chat → messages should arrive instantly ✅
