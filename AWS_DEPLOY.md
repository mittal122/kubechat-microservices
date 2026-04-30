# 🚀 KubeChat — AWS Free Tier Deployment Guide

> **AWS Free Tier:** EC2 t2.micro — 750 hours/month FREE for 12 months.  
> Requires a card for signup but **no charges** as long as you stay within free tier.

---

## What You Get Free

| Resource | Free Tier Limit | Usage |
|----------|----------------|-------|
| EC2 t2.micro | 750 hrs/month | Our VM ✅ |
| 8 GB RAM | - | 1 GB on t2.micro |
| 30 GB EBS Storage | 30 GB | We use ~5 GB ✅ |
| Data Transfer | 15 GB/month out | Enough for chat ✅ |

---

## Step 1 — Create AWS Account

1. Go to https://aws.amazon.com → **"Create an AWS Account"**
2. Fill in email, password, account name
3. Add credit/debit card (verification only — stays free if you use t2.micro)
4. Verify phone number
5. Select **"Basic Support - Free"**
6. Sign in to AWS Console: https://console.aws.amazon.com

---

## Step 2 — Launch EC2 Instance

1. In AWS Console → search **"EC2"** → click it
2. Click **"Launch Instance"** (orange button)
3. Fill in:

| Field | Value |
|-------|-------|
| **Name** | `kubechat-server` |
| **OS** | Ubuntu Server 22.04 LTS (Free tier eligible) |
| **Architecture** | 64-bit (x86) |
| **Instance type** | `t2.micro` ← **must pick this for free tier** |
| **Key pair** | Create new → name it `kubechat-key` → Download `.pem` file |
| **Network** | Default VPC |
| **Auto-assign public IP** | Enable |
| **Storage** | 20 GB gp2 (free tier gives 30GB) |

4. Under **"Network settings"** → **"Edit"** → add these firewall rules:

| Type | Port | Source |
|------|------|--------|
| SSH | 22 | My IP (for your safety) |
| Custom TCP | 5000 | 0.0.0.0/0 (public access) |
| HTTP | 80 | 0.0.0.0/0 |

5. Click **"Launch Instance"** → wait ~1 minute

---

## Step 3 — Connect to Your EC2 Instance

### Option A — Connect via Browser (easiest)
1. In EC2 dashboard → click your instance → **"Connect"**
2. Click **"EC2 Instance Connect"** tab → **"Connect"**
3. A terminal opens in your browser ✅

### Option B — Connect via SSH from Windows
```powershell
# Move your downloaded key to a safe place first
Move-Item ~/Downloads/kubechat-key.pem ~/kubechat-key.pem

# SSH in (replace YOUR_IP with your instance's Public IPv4)
ssh -i ~/kubechat-key.pem ubuntu@YOUR_IP
```

---

## Step 4 — Run the Auto-Setup Script (1 command!)

In the EC2 terminal, paste this single command:

```bash
curl -sSL https://raw.githubusercontent.com/mittal122/kubechat-microservices/master/aws-setup.sh | bash
```

This automatically:
- ✅ Installs Docker
- ✅ Clones your repository
- ✅ Creates environment config with your MongoDB + Redis credentials
- ✅ Builds and starts all 4 services
- ✅ Shows your server URL at the end

**Wait 5-10 minutes for Docker to build all images (first time only).**

---

## Step 5 — Find Your Server URL

After the script finishes, it shows:
```
Server URL: http://YOUR_IP:5000
```

To find your IP anytime:
1. EC2 Console → click your instance
2. Copy **"Public IPv4 address"**
3. Your server URL = `http://YOUR_IP:5000`

---

## Step 6 — Update Flutter App

Open `flutter_chat_app/lib/config/api_config.dart` on your PC and change:

```dart
static const String _productionUrl =
    'http://YOUR_EC2_IP:5000'; // ← paste your EC2 Public IPv4 here
```

Build production APK:
```powershell
cd flutter_chat_app
flutter build apk --release --dart-define=ENV=production
```

APK location: `flutter_chat_app\build\app\outputs\flutter-apk\app-release.apk`

---

## Step 7 — Test Everything

Open browser → go to:
```
http://YOUR_EC2_IP:5000/health
```

You should see:
```json
{"service":"api-gateway","status":"healthy","uptime":123}
```

✅ If you see this → your app is live!

---

## Useful Commands (run on EC2)

```bash
# View all running containers
docker ps

# View logs from all services
cd /opt/kubechat && docker compose logs -f

# View logs from one service
docker compose logs -f chat-service

# Restart all services
docker compose restart

# Update to latest code
cd /opt/kubechat && git pull && docker compose up -d --build

# Stop everything
docker compose down

# Check server health
curl http://localhost:5000/health
```

---

## ⚠️ Free Tier Warnings

1. **Stop the instance when not using it** to save your 750 hours:
   - EC2 Console → select instance → **"Instance State"** → **"Stop"**
   - Start it again when needed → it gets a NEW IP each time unless you use Elastic IP

2. **Elastic IP (optional):** Get a permanent IP that doesn't change:
   - EC2 → **Elastic IPs** → **Allocate** → **Associate** with your instance
   - Free as long as the instance is RUNNING (charged if instance is stopped)

3. **Auto-shutdown after 12 months:** After 12 months, t2.micro is no longer free.
   - Switch to GCP e2-micro which is free FOREVER

---

## 🔄 To Update the App in Future

When you push code changes to GitHub:
```bash
# SSH into EC2 → run:
cd /opt/kubechat
git pull origin master
docker compose -f docker-compose.prod.yml up -d --build
```

Rebuild Flutter APK if you changed any Flutter code.
