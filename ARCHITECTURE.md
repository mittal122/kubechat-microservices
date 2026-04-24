# 🏗️ Chattining Application — Complete Architecture

![Chattining Architecture Overview](docs/architecture_diagram.png)

---

## 1. Complete System Overview

```mermaid
graph TB
    subgraph CLIENTS["👥 Client Applications"]
        REACT["⚛️ React Web App<br/>Vite + Nginx<br/>Port 3000"]
        FLUTTER["📱 Flutter App<br/>Windows / Mobile<br/>Dio + Socket.IO Client"]
    end

    subgraph K8S["☸️ Kubernetes Cluster (EKS)"]
        subgraph INGRESS_LAYER["🌐 Entry Point"]
            INGRESS["🔒 NGINX Ingress<br/>TLS · Sticky Sessions · WSS<br/>cert-manager + Let's Encrypt"]
        end

        subgraph GATEWAY_LAYER["🚪 API Gateway — Port 5000"]
            GW["API Gateway<br/>http-proxy-middleware<br/>WebSocket Upgrade Proxy<br/>2 replicas"]
        end

        subgraph SERVICES["🔧 Microservices"]
            AUTH["🔐 Auth Service<br/>Port 5001<br/>HPA: 2→6 pods"]
            USER["👤 User Service<br/>Port 5002<br/>HPA: 2→4 pods"]
            CHAT["💬 Chat Service<br/>Port 5003<br/>HPA: 2→8 pods"]
        end

        subgraph DATA["💾 Data Layer"]
            MONGO[("🍃 MongoDB<br/>Shared DB<br/>Collection Isolation")]
            REDIS["⚡ Redis 7<br/>Socket.IO Adapter<br/>Pub/Sub Only"]
        end

        subgraph MONITORING["📊 Monitoring Stack"]
            PROM["🔥 Prometheus<br/>Port 9090<br/>30-day retention"]
            GRAF["📈 Grafana<br/>Port 3001 / NodePort 31001<br/>8-Panel Dashboard"]
        end
    end

    REACT -->|"HTTPS / WSS"| INGRESS
    FLUTTER -->|"HTTPS / WSS"| INGRESS
    INGRESS -->|"/api/* /socket.io/*"| GW
    INGRESS -->|"/*"| REACT
    GW -->|"/api/auth/*"| AUTH
    GW -->|"/api/users/*"| USER
    GW -->|"/api/messages/* /api/conversations/* /socket.io/*"| CHAT
    AUTH --> MONGO
    USER --> MONGO
    CHAT --> MONGO
    CHAT --> REDIS
    PROM -.->|"scrape /metrics"| GW
    PROM -.->|"scrape /metrics"| AUTH
    PROM -.->|"scrape /metrics"| USER
    PROM -.->|"scrape /metrics"| CHAT
    GRAF -.->|"query"| PROM

    style CLIENTS fill:#1a1a2e,stroke:#e94560,color:#fff
    style K8S fill:#0d1117,stroke:#58a6ff,color:#fff
    style INGRESS_LAYER fill:#0d2137,stroke:#3fb950,color:#fff
    style GATEWAY_LAYER fill:#2d1b00,stroke:#f0883e,color:#fff
    style SERVICES fill:#1b1b3a,stroke:#bc8cff,color:#fff
    style DATA fill:#0d2818,stroke:#3fb950,color:#fff
    style MONITORING fill:#2d1f00,stroke:#d29922,color:#fff
```

---

## 2. Microservice Detail — What Each Service Does

````carousel
### 🔐 Auth Service (Port 5001)
```
Endpoints:
  POST /api/auth/register  → Create account (name, email, password)
  POST /api/auth/login     → JWT access token (15min) + refresh token (7d)
  POST /api/auth/refresh   → Rotate access token using refresh token
  POST /api/auth/logout    → Invalidate refresh token
  GET  /api/auth/me        → Get current user profile

Security:
  ✅ bcrypt (10 salt rounds)
  ✅ Joi input validation
  ✅ Rate limiting (5 attempts/min/IP)
  ✅ Refresh token rotation in MongoDB

HPA: 2 → 6 pods (65% CPU threshold)
```
<!-- slide -->
### 👤 User Service (Port 5002)
```
Endpoints:
  GET /api/users              → List all users (paginated)
  GET /api/users/search?query= → Search by name/email

Search Strategy:
  query.length < 3  → MongoDB regex (case-insensitive)
  query.length >= 3 → MongoDB $text index (full-text)

HPA: 2 → 4 pods (65% CPU threshold)
```
<!-- slide -->
### 💬 Chat Service (Port 5003)
```
REST Endpoints:
  POST /api/messages/:receiverId    → Send message
  GET  /api/messages/:conversationId → Get message history
  PUT  /api/messages/:convId/seen   → Mark messages as read
  GET  /api/conversations            → List conversations

WebSocket Events (Socket.IO):
  connection     → Track user online, deliver pending messages
  join chat      → Join conversation room
  newMessage     → Real-time message delivery
  typing         → Typing indicator
  stop typing    → Stop typing indicator
  messagesDelivered → Delivery receipts
  messagesSeen   → Read receipts (blue ticks)
  getOnlineUsers → Broadcast online user list
  disconnect     → Remove from tracking

Message Status Flow:
  sent → delivered (receiver online) → seen (receiver reads)

HPA: 2 → 8 pods (65% CPU, 75% memory)
Resources: 256Mi–512Mi RAM (holds WebSocket connections)
```
<!-- slide -->
### 🚪 API Gateway (Port 5000)
```
Proxy Routes:
  /api/auth/*         → auth-service:5001
  /api/users/*        → user-service:5002
  /api/messages/*     → chat-service:5003
  /api/conversations/* → chat-service:5003
  /socket.io/*        → chat-service:5003 (WebSocket upgrade)

Key Implementation:
  ✅ http-proxy-middleware v3
  ✅ http.createServer() for WS upgrade
  ✅ server.on('upgrade', socketProxy.upgrade)
  ✅ pathRewrite to restore Express-stripped mount prefix
  ✅ prom-client metrics at /metrics

2 replicas (no HPA — lightweight reverse proxy)
Resources: 128Mi–256Mi RAM
```
````

---

## 3. Data Flow — Sending a Chat Message

```mermaid
sequenceDiagram
    participant A as 👩 Alice (Flutter)
    participant GW as 🚪 API Gateway
    participant CS as 💬 Chat Service
    participant DB as 🍃 MongoDB
    participant RD as ⚡ Redis
    participant B as 👨 Bob (React)

    Note over A,B: Alice sends "Hello Bob!"

    A->>GW: POST /api/messages/:bobId<br/>Authorization: Bearer JWT
    GW->>CS: Proxy → POST /api/messages/:bobId
    CS->>DB: Find/Create Conversation
    CS->>DB: Create Message (status: "delivered")
    CS->>RD: Publish "newMessage" event
    RD-->>CS: Broadcast to all chat-service pods
    CS-->>B: Socket.IO emit("newMessage")
    CS-->>GW: 201 { message object }
    GW-->>A: 201 Created

    Note over A,B: Bob reads the message

    B->>GW: PUT /api/messages/:convId/seen
    GW->>CS: Proxy → PUT /api/messages/:convId/seen
    CS->>DB: Update status → "seen"
    CS->>RD: Publish "messagesSeen" event
    RD-->>CS: Broadcast
    CS-->>A: Socket.IO emit("messagesSeen")
    CS-->>GW: 200 OK
    GW-->>B: 200 OK
```

---

## 4. Authentication Flow

```mermaid
sequenceDiagram
    participant U as 📱 Flutter App
    participant GW as 🚪 Gateway
    participant AS as 🔐 Auth Service
    participant DB as 🍃 MongoDB

    Note over U,DB: Registration

    U->>GW: POST /api/auth/register<br/>{name, email, password}
    GW->>AS: Proxy
    AS->>AS: Joi validation
    AS->>AS: bcrypt hash (10 rounds)
    AS->>DB: Create User document
    AS->>AS: Generate JWT (15min) + Refresh (7d)
    AS->>DB: Store refresh token
    AS-->>GW: {accessToken, refreshToken, user}
    GW-->>U: 201 Created
    U->>U: Save tokens (SharedPreferences)

    Note over U,DB: Auto Token Refresh (Dio Interceptor)

    U->>GW: GET /api/auth/me (expired JWT)
    GW->>AS: Proxy → 401 Unauthorized
    AS-->>GW: 401
    GW-->>U: 401
    U->>GW: POST /api/auth/refresh<br/>{refreshToken}
    GW->>AS: Proxy
    AS->>DB: Validate + rotate refresh token
    AS-->>GW: {new accessToken}
    GW-->>U: 200 OK
    U->>U: Update stored token
    U->>GW: GET /api/auth/me (new JWT) ← auto-retry
    GW->>AS: Proxy → 200 OK
    AS-->>GW: {user profile}
    GW-->>U: 200 OK
```

---

## 5. Kubernetes Deployment Topology

```mermaid
graph LR
    subgraph NS["Namespace: chattining"]
        direction TB

        subgraph DEPLOY["Deployments (pods)"]
            GW["api-gateway<br/>×2 pods"]
            AUTH["auth-service<br/>×2-6 pods"]
            USER["user-service<br/>×2-4 pods"]
            CHAT["chat-service<br/>×2-8 pods"]
            FE["frontend<br/>×2 pods"]
            RD["redis<br/>×1 pod"]
            PR["prometheus<br/>×1 pod"]
            GR["grafana<br/>×1 pod"]
        end

        subgraph SVC["Services (ClusterIP)"]
            GWS["gateway-service<br/>:5000"]
            AUS["auth-service<br/>:5001"]
            USS["user-service<br/>:5002"]
            CHS["chat-service<br/>:5003"]
            FES["frontend-service<br/>:80"]
            RDS["redis<br/>:6379"]
            PRS["prometheus-service<br/>:9090"]
            GRS["grafana-service<br/>:3000<br/>NodePort :31001"]
        end

        subgraph HPA["Horizontal Pod Autoscalers"]
            H1["auth-hpa<br/>2→6 @ 65% CPU"]
            H2["user-hpa<br/>2→4 @ 65% CPU"]
            H3["chat-hpa<br/>2→8 @ 65% CPU + 75% mem"]
            H4["frontend-hpa<br/>2→4"]
        end

        subgraph PVC["Persistent Volumes"]
            P1["prometheus-data<br/>10Gi"]
            P2["grafana-data<br/>2Gi"]
        end
    end

    style DEPLOY fill:#1a1a2e,stroke:#bc8cff,color:#fff
    style SVC fill:#0d2137,stroke:#58a6ff,color:#fff
    style HPA fill:#2d1f00,stroke:#d29922,color:#fff
    style PVC fill:#0d2818,stroke:#3fb950,color:#fff
```

---

## 6. CI/CD Pipeline

```mermaid
graph LR
    subgraph TRIGGER["🔔 Trigger"]
        PUSH["git push main"]
        PR["Pull Request"]
    end

    subgraph TEST["🧪 Stage 1: Test"]
        T1["Auth Service<br/>npm test"]
        T2["User Service<br/>npm test"]
        T3["Chat Service<br/>npm test"]
    end

    subgraph BUILD["🐳 Stage 2: Build (Matrix ×5)"]
        B1["chattining-gateway"]
        B2["chattining-auth"]
        B3["chattining-user"]
        B4["chattining-chat"]
        B5["chattining-frontend"]
    end

    subgraph SCAN["🔍 Stage 2b: Security"]
        SC["Docker Scout<br/>CVE Scan<br/>Critical + High"]
    end

    subgraph PUSH_REG["📦 Stage 2c: Push"]
        ECR["AWS ECR"]
        DH["Docker Hub"]
    end

    subgraph DEPLOY["🚀 Stage 3: Deploy"]
        EKS["AWS EKS<br/>kubectl apply<br/>rollout status"]
    end

    PUSH --> TEST
    PR --> TEST
    T1 & T2 & T3 --> BUILD
    B1 & B2 & B3 & B4 & B5 --> SC
    SC --> PUSH_REG
    ECR & DH --> |"main branch only"| EKS

    style TRIGGER fill:#2d1b00,stroke:#f0883e,color:#fff
    style TEST fill:#1b2e1b,stroke:#3fb950,color:#fff
    style BUILD fill:#1a1a2e,stroke:#58a6ff,color:#fff
    style SCAN fill:#2d0d0d,stroke:#f85149,color:#fff
    style PUSH_REG fill:#0d2137,stroke:#bc8cff,color:#fff
    style DEPLOY fill:#0d2818,stroke:#3fb950,color:#fff
```

---

## 7. Monitoring — Grafana Dashboard Panels

```mermaid
graph TB
    subgraph GRAFANA["📈 Grafana Dashboard — 8 Panels"]
        P1["📊 HTTP Request Rate<br/>per service (timeseries)"]
        P2["⏱️ Latency P95<br/>per service (timeseries)"]
        P3["🔌 Active WebSocket<br/>Connections (stat gauge)"]
        P4["💬 Messages Sent<br/>(stat counter)"]
        P5["🔐 Login Attempts<br/>success/failure (timeseries)"]
        P6["📝 User Registrations<br/>(stat counter)"]
        P7["💾 Memory Usage<br/>per service (timeseries)"]
        P8["⚠️ Gateway Proxy Errors<br/>(timeseries)"]
    end

    subgraph METRICS["🔥 Prometheus Metrics"]
        M1["http_requests_total"]
        M2["http_request_duration_seconds"]
        M3["chat_active_websocket_connections"]
        M4["chat_messages_sent_total"]
        M5["auth_login_attempts_total"]
        M6["auth_registrations_total"]
        M7["process_resident_memory_bytes"]
        M8["gateway_proxy_errors_total"]
    end

    M1 --> P1
    M2 --> P2
    M3 --> P3
    M4 --> P4
    M5 --> P5
    M6 --> P6
    M7 --> P7
    M8 --> P8

    style GRAFANA fill:#1a1a2e,stroke:#d29922,color:#fff
    style METRICS fill:#2d1b00,stroke:#f0883e,color:#fff
```

---

## 8. File Structure — Quick Reference

```
chattining-application/
├── 📱 flutter_chat_app/          ← Flutter Desktop/Mobile Client
│   └── lib/
│       ├── config/               (API URLs, theme)
│       ├── models/               (UserModel)
│       ├── providers/            (AuthProvider, ChatProvider)
│       ├── screens/              (Login, Register, Chat)
│       ├── services/             (AuthService, SocketService, ApiService)
│       └── main.dart
│
├── ⚛️  frontend/                  ← React Web Client (Vite)
│   ├── Dockerfile
│   └── src/
│
├── 🔧 services/                  ← Microservices (Node.js)
│   ├── api-gateway/              Port 5000 — Reverse proxy
│   ├── auth-service/             Port 5001 — JWT, login, register
│   ├── user-service/             Port 5002 — Search, listing
│   └── chat-service/             Port 5003 — Messages, Socket.IO
│
├── ☸️  k8s/
│   ├── production/               ← 14 K8s manifests (27 docs)
│   │   ├── namespace.yaml
│   │   ├── configmap.yaml        (chattining-config)
│   │   ├── secrets.yaml          (chattining-secrets)
│   │   ├── redis-deployment.yaml
│   │   ├── gateway-deployment.yaml
│   │   ├── auth-deployment.yaml  (+ HPA)
│   │   ├── user-deployment.yaml  (+ HPA)
│   │   ├── chat-deployment.yaml  (+ HPA)
│   │   ├── frontend-*.yaml      (deploy + service + HPA)
│   │   ├── prometheus-deployment.yaml
│   │   ├── grafana-deployment.yaml
│   │   └── ingress.yaml
│   └── (dev manifests — historical)
│
├── 📊 monitoring/
│   ├── prometheus/prometheus.yml  ← Scrape config
│   └── grafana/                   ← Dashboard JSON + provisioning
│
├── 🔄 .github/workflows/
│   ├── docker-publish.yml         ← Build 5 images (matrix)
│   └── deploy.yml                 ← Full CI/CD → EKS
│
├── 🐳 docker-compose.yml         ← 9 services local orchestration
├── 📋 Jenkinsfile                 ← Parallel build pipeline
├── 📖 PROJECT_PROGRESS_REPORT.md  ← Phase-by-phase dev log
├── ✅ FEATURE_CHECKLIST.md        ← Complete feature tracking
└── 🤝 SESSION_HANDOFF.md         ← Quick context summary
```

---

## 9. Port Map — Quick Reference

| Port | Service | Access |
|------|---------|--------|
| **5000** | API Gateway | All client traffic enters here |
| 5001 | Auth Service | Internal only (via gateway) |
| 5002 | User Service | Internal only (via gateway) |
| 5003 | Chat Service | Internal only (via gateway) |
| 6379 | Redis | Internal only (Socket.IO adapter) |
| 27017 | MongoDB | Internal only |
| 3000 | Frontend (React) | Via Ingress `/` |
| 9090 | Prometheus | Internal (port-forward to access) |
| 31001 | Grafana | NodePort (direct access) |

---

> **💡 One sentence to remember it all:**
> *Clients hit the **NGINX Ingress** → **API Gateway** (port 5000) routes to **Auth/User/Chat** microservices → all backed by **MongoDB** + **Redis** → monitored by **Prometheus + Grafana** → deployed via **GitHub Actions matrix** to **AWS EKS**.*
