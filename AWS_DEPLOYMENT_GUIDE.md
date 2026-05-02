# 🚀 KubeChat AWS EC2 Deployment Guide

This guide explains how to deploy, manage, and update the KubeChat Microservices backend on an Amazon Web Services (AWS) EC2 instance.

---

## 1. Prerequisites (AWS Setup)

1. **Launch an EC2 Instance:**
   - **OS:** Ubuntu 22.04 LTS or 24.04 LTS
   - **Instance Type:** t2.micro (Free Tier) or t3.small
   - **Storage:** 20 GB gp3 SSD
   
2. **Configure Security Groups (Inbound Rules):**
   You MUST open these ports to allow the Flutter app and Grafana to connect:
   - `22` (SSH) — Anywhere (or My IP)
   - `80` (HTTP) — Anywhere (Optional, for reverse proxy later)
   - `5000` (API Gateway) — Anywhere
   - `5003` (Chat Socket) — Anywhere
   - `3000` (Grafana Dashboards) — Anywhere

3. **Allocate an Elastic IP:**
   Assign an Elastic IP to your EC2 instance so the IP address never changes when you reboot.

---

## 2. Initial Server Setup (Run once)

SSH into your EC2 instance and install Docker and Git:

```bash
# Update server
sudo apt update && sudo apt upgrade -y

# Install Git
sudo apt install git -y

# Install Docker & Docker Compose
sudo apt install docker.io docker-compose-v2 -y
sudo systemctl enable docker
sudo systemctl start docker

# Add your user to the docker group (optional, prevents needing 'sudo' for docker commands)
sudo usermod -aG docker $USER
```

---

## 3. Clone and Run the Project

1. **Clone the Repository:**
   ```bash
   cd /opt
   sudo git clone https://github.com/mittal122/kubechat-microservices.git kubechat
   cd /opt/kubechat
   ```

2. **Start the Microservices Stack:**
   We use the production compose file which includes the API Gateway, Auth Service, User Service, Chat Service, MongoDB, Redis, Prometheus, Loki, and Grafana.

   ```bash
   sudo docker compose -f docker-compose.prod.yml up -d --build
   ```

3. **Verify Containers are Running:**
   ```bash
   sudo docker ps
   ```
   You should see all containers listed as `Up`.

---

## 4. Connecting the Flutter App

In your Flutter project, open `lib/config/api_config.dart`. Ensure the `_productionUrl` matches your EC2 Elastic IP:

```dart
static const String _productionUrl = 'http://YOUR_EC2_ELASTIC_IP:5000';
static String get socketUrl => 'http://YOUR_EC2_ELASTIC_IP:5003';
```

Build the release APK:
```powershell
flutter build apk --release --dart-define=ENV=production
```

---

## 5. How to Update the Server (When you change code)

Whenever you make changes to the Node.js backend and push them to GitHub, run this single command on your EC2 instance to update everything without downtime:

```bash
cd /opt/kubechat && sudo git pull origin master && sudo docker compose -f docker-compose.prod.yml up -d --build
```
*(If you only updated one service, you can append its name to the end, e.g., `... --build chat-service`)*

---

## 6. Monitoring and Logs

We have integrated **Promtail + Loki + Prometheus + Grafana** for rich observability.

### View Live Terminal Logs (Standard)
To watch the live logs of a specific service (e.g., chat-service):
```bash
sudo docker logs kubechat-chat -f --tail 50
```

### View Rich Logs in Grafana (Advanced)
1. Open your browser and go to: `http://YOUR_EC2_ELASTIC_IP:3000`
2. Login with the default Grafana credentials.
3. Go to **Explore** (Compass icon on the left).
4. Select **Loki** from the top dropdown.
5. In the Label filters, select `container` = `kubechat-chat` or `kubechat-auth`.
6. Click **Run Query** in the top right to see human-readable user activity (e.g., `🟢 [ONLINE] "Meet" is now online`).
