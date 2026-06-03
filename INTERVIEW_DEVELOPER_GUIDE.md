# Chattining Application — Complete Interview & Developer Guide

> **A single document that lets a new developer fully understand, contribute, and deploy this project — and lets you confidently answer any interview question from basic to advanced.**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Complete Feature Breakdown](#2-complete-feature-breakdown)
3. [Architecture Deep Dive](#3-architecture-deep-dive)
4. [Technology Stack Explanation](#4-technology-stack-explanation)
5. [Development Details](#5-development-details)
6. [Database Design](#6-database-design)
7. [Real-Time Communication Deep Dive](#7-real-time-communication-deep-dive)
8. [Challenges & Solutions](#8-challenges--solutions)
9. [Deployment — Step by Step](#9-deployment--step-by-step)
10. [DevOps & System Design Concepts](#10-devops--system-design-concepts)
11. [Interview Preparation Section](#11-interview-preparation-section)
12. [Onboarding Guide for New Developers](#12-onboarding-guide-for-new-developers)

---

## 1. Project Overview

### 1.1 What Is Chattining?

Chattining (also branded **KubeChat**) is a production-grade, real-time chat application built with a **microservices architecture**. It supports two client platforms — a **React web app** and a **Flutter desktop/mobile app** — communicating over REST APIs and WebSockets. The backend is decomposed into 4 independent Node.js microservices, orchestrated via **Kubernetes (AWS EKS)**, containerized with **Docker**, monitored by **Prometheus + Grafana**, and deployed through **GitHub Actions + Jenkins** CI/CD pipelines.

### 1.2 Problem It Solves

Building a scalable, real-time messaging system from scratch involves solving many interconnected problems simultaneously:

| Problem | How Chattining Solves It |
|---------|--------------------------|
| Secure authentication with token lifecycle | Dual-token JWT system (access 15min + refresh 7d) with rotation |
| Real-time message delivery across devices | Socket.IO WebSockets with multi-device tracking via `userSocketMap` |
| Message delivery guarantees (sent → delivered → seen) | WhatsApp-style triple-tick system with event-driven status updates |
| Horizontal scaling of WebSocket servers | Redis Pub/Sub adapter for Socket.IO cross-pod broadcasting |
| Monolithic bottlenecks at scale | Microservice decomposition: Auth, User, Chat, API Gateway |
| Infrastructure reproducibility | Terraform IaC for AWS VPC + EKS + ECR provisioning |
| Deployment automation | Dual CI/CD: GitHub Actions (cloud) + Jenkins (local via Ngrok) |
| Observability in production | Prometheus metrics + Grafana dashboards + Loki centralized logging |

### 1.3 High-Level Architecture (One Sentence)

> Clients hit the **NGINX Ingress** → **API Gateway** (port 5000) routes to **Auth/User/Chat** microservices → all backed by **MongoDB** + **Redis** → monitored by **Prometheus + Grafana + Loki** → deployed via **GitHub Actions matrix** to **AWS EKS**.

---

## 2. Complete Feature Breakdown

### 2.1 Authentication & Security

#### What It Does
Handles user registration, login, token issuance, token refresh, and secure logout across both React and Flutter clients.

#### Why It Was Needed
Every multi-user system needs identity verification. A naive implementation (permanent tokens, plain passwords) creates catastrophic security holes. The dual-token system prevents both token theft escalation and session hijacking.

#### How It Was Implemented

**Registration Flow:**
1. Client sends `POST /api/auth/register` with `{name, email, password}`
2. Joi schema validates input (name ≥ 2 chars, valid email, password ≥ 6 chars)
3. Check if email already exists → return `400` if duplicate
4. Hash password with `bcrypt` (10 salt rounds — ~100ms per hash, brute-force resistant)
5. Create User document in MongoDB
6. Generate Access Token (JWT, 15-min expiry) + Refresh Token (7-day expiry)
7. Store refresh token in the User document for later validation
8. Return tokens + user profile

**Login Flow:**
1. Client sends `POST /api/auth/login` with `{email, password}`
2. Rate limiter checks: ≤ 5 attempts per minute per IP (brute-force protection)
3. Find user by email, select password field explicitly (excluded by default via `.select("-password")`)
4. Compare plaintext password against bcrypt hash via `user.matchPassword()`
5. Generate new access + refresh tokens → store refresh in DB → return to client

**Token Refresh Flow (Silent Renewal):**
1. Client's Dio/Axios interceptor catches a `401 Unauthorized` response
2. Interceptor sends `POST /api/auth/refresh` with the stored refresh token
3. Server verifies the refresh token's JWT signature
4. Validates that the token matches the one stored in DB (prevents reuse of stolen tokens)
5. Issues a new access token without requiring re-login
6. Interceptor retries the original failed request with the new token

**Logout Flow:**
- `POST /api/auth/logout` sets `refreshToken = null` in DB
- The refresh token becomes permanently invalidated

#### Design Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| **JWT over Session Cookies** | JWTs are stateless, work across domains (React + Flutter), and don't require server-side session storage. Trade-off: tokens can't be revoked instantly (mitigated by short 15-min access token life). |
| **15-min access / 7-day refresh** | Short access window limits damage from stolen tokens. 7-day refresh avoids frequent re-logins. |
| **Shared JWT_SECRET across services** | Pragmatic choice — any service can verify tokens independently without calling auth-service. Trade-off: a single secret to protect (stored in K8s Secrets). |
| **bcrypt over Argon2** | bcrypt is battle-tested, widely supported, and sufficient for this use case. Argon2 is newer and more configurable but has fewer Node.js bindings. |
| **Rate limiting at auth-service level** | `express-rate-limit` at 5 req/min/IP on login endpoint. Chosen over API Gateway-level rate limiting for simplicity. |

---

### 2.2 User Discovery & Search

#### What It Does
Allows users to search for other users by name or email to start new conversations.

#### Why It Was Needed
A chat app without discovery is unusable. Users need to find contacts without knowing exact usernames.

#### How It Was Implemented

**Hybrid Search Strategy:**
```
If query.length < 3 → MongoDB $regex (partial match, case-insensitive)
If query.length >= 3 → MongoDB $text index (full-text search with relevance scoring)
```

**Why Hybrid?** Short queries like "Al" produce garbage results with `$text` (designed for word-level matching), but `$regex` handles them naturally. Longer queries like "Alice" benefit from `$text`'s inverted index speed and relevance scoring (`$meta: "textScore"`).

**Pagination:** Both `getAllUsers` and `searchUsers` accept `?page=1&limit=10` query parameters to prevent loading thousands of users into memory.

**MongoDB Indexes:**
- `{ name: "text", email: "text" }` — compound text index for full-text search
- Enables Google-style relevance sorting via `$meta: "textScore"`

#### Design Decision
**MongoDB text indexing over Elasticsearch:** For a chat app with thousands of users, MongoDB's native `$text` is sufficient and avoids adding another infrastructure dependency. Elasticsearch would be warranted at millions of users.

---

### 2.3 Conversation Management

#### What It Does
Groups messages between two users into structured conversations with previews and activity sorting.

#### Why It Was Needed
Without conversations, messages are loose documents with no grouping — impossible to render a WhatsApp-style chat list.

#### How It Was Implemented

**Auto-Creation:** When `sendMessage` is called, the controller checks if a `Conversation` exists between the sender and receiver. If not, it auto-creates one — zero manual setup required.

**Schema Design:**
```javascript
{
  participants: [ObjectId, ObjectId],  // Exactly 2 users for 1-to-1
  lastMessage: String,                 // Preview text for chat list
  lastMessageAt: Date,                 // Sorting: newest first
  isGroup: Boolean,                    // Future-proof for group chats
  groupName: String,                   // Group display name
  groupAdmin: ObjectId,                // Group creator
}
```

**Indexes:**
- `{ participants: 1 }` — fast lookup by user
- `{ lastMessageAt: -1 }` — sorted conversation list

---

### 2.4 Real-Time Messaging & Socket.IO

#### What It Does
Enables instant bidirectional communication: live message delivery, typing indicators, online/offline presence, and read receipts.

#### Why It Was Needed
REST polling would destroy database performance and add unacceptable latency. Users expect sub-second message delivery.

#### How It Was Implemented
See [Section 7: Real-Time Communication Deep Dive](#7-real-time-communication-deep-dive) for the complete technical breakdown.

---

### 2.5 Message Delivery Status System (Triple-Tick)

#### What It Does
WhatsApp-style lifecycle: `sent` (✓ gray) → `delivered` (✓✓ gray) → `seen` (✓✓ violet).

#### Why It Was Needed
Users need confirmation that their messages were received and read. Without status indicators, users feel uncertain and send duplicate messages.

#### How It Was Implemented

**Data Model:** Replaced a simple `isSeen: Boolean` with a Mongoose ENUM:
```javascript
status: {
  type: String,
  enum: ['sent', 'delivered', 'seen'],
  default: 'sent'
}
```

**State Transitions:**

| Transition | Trigger | Mechanism |
|-----------|---------|-----------|
| → `sent` | Message created, receiver offline | Default on `Message.create()` |
| → `delivered` | Message created, receiver online | `sendMessage` checks `userSocketMap` |
| `sent` → `delivered` | Receiver comes online | Socket `connection` event bulk-updates |
| → `seen` | Receiver opens conversation | `PUT /api/messages/:convId/seen` |

**Design Decision — Enum over Booleans:**
If we used `isDelivered: Boolean` + `isSeen: Boolean`, we risk states like `isSeen: true, isDelivered: false` (logically impossible). A single ENUM enforces a strict, linear state machine.

**Design Decision — REST for "Seen" + Socket for notification:**
The `PUT /seen` REST endpoint mutates the database (source of truth), then triggers a Socket.IO `messagesSeen` event to notify the sender in real-time. This separates persistence from notification — the REST call is idempotent, load-balanceable, and cacheable.

---

### 2.6 Multi-Device Support

#### What It Does
Users connected on multiple devices (phone + laptop + tablet) receive messages on ALL active sessions simultaneously.

#### How It Was Implemented
The `userSocketMap` uses arrays instead of single values:
```javascript
userSocketMap = {
  "userId123": ["socketId_phone", "socketId_laptop", "socketId_tablet"]
}
```

When delivering a message, ALL socket IDs for the receiver are iterated:
```javascript
receiverSocketIds.forEach(socketId => {
  io.to(socketId).emit("newMessage", messageJSON);
});
```

On disconnect, only the specific socket is removed. The user remains "online" until ALL sockets disconnect.

---

### 2.7 React Web Frontend

#### What It Does
Full-featured chat SPA with dark glassmorphic theme, floating chat workspace, emoji picker, audio notifications, and real-time updates.

#### Key UI Features
- **Floating Chat Workspace:** Full-screen focused layout with centered conversation
- **Glassmorphic Design:** `backdrop-blur` overlays, violet gradient message bubbles
- **ConversationOverlay:** Animated floating panel triggered by a `💬 Chats` pill button
- **Smart Auto-Scroll:** Only scrolls to bottom if user isn't reading history
- **Throttled Typing:** 1.5s idle-clock prevents WebSocket spam
- **Anti-Race Condition:** `msg._id` comparison prevents duplicates from HTTP + Socket
- **Audio Notification:** Zero-dependency `AudioContext` synthesizer (D5→A5 sine wave)
- **Reconnection Monitor:** Animated "Reconnecting…" pill on WiFi drop

#### Technologies
- **Vite** — HMR dev server + optimized production bundler
- **React** — Component-based UI with hooks
- **Tailwind CSS v4** — Modern `@tailwindcss/vite` engine
- **Socket.IO Client** — Real-time event handling
- **emoji-picker-react** — Dark-themed emoji selector

---

### 2.8 Flutter Desktop/Mobile App

#### What It Does
Cross-platform native app (Windows/macOS/Android) mirroring the web chat experience with offline token persistence.

#### Key Implementation
- **Provider State Management:** `MultiProvider` for `AuthProvider` + `ChatProvider`
- **Dio HTTP Client:** Auto-refresh JWT interceptor catches 401s silently
- **socket_io_client:** Native WebSocket transport with JWT authentication
- **SharedPreferences:** Secure token storage on host device
- **Google Fonts + Custom Theme:** Dark glassmorphic aesthetic matching the web app

---

## 3. Architecture Deep Dive

### 3.1 Frontend Architecture

```
React Web App (Vite)
├── src/
│   ├── components/
│   │   ├── ChatPage.jsx          ← Main chat container
│   │   ├── ChatSidebar.jsx       ← Conversation list
│   │   └── ChatWindow.jsx        ← Message display + input
│   ├── context/
│   │   └── AuthContext.jsx       ← Global auth state (React Context)
│   ├── hooks/
│   │   └── useSocket.js          ← Socket.IO connection management
│   ├── services/
│   │   └── api.js                ← Axios instance with interceptors
│   └── App.jsx                   ← Router + Protected Routes
├── nginx.conf                    ← Reverse proxy for API/Socket in Docker
└── Dockerfile                    ← Multi-stage: node build → nginx serve
```

**State Management:** React Context (not Redux) — lightweight for this scale. Auth state is global; chat state is component-local.

**API Layer:** Axios instance with base URL from `VITE_API_BASE` env var. In development: `http://localhost:5000`. In Docker: empty (same-origin via nginx proxy).

---

### 3.2 Backend Architecture — Microservices

The monolithic `backend/server.js` was surgically decomposed into 4 independent Node.js services:

```
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway (Port 5000)                       │
│                  http-proxy-middleware + http-proxy              │
│              2 replicas · 128-256Mi RAM · No HPA                │
├─────────────────────────────────────────────────────────────────┤
│         │                    │                    │              │
│   /api/auth/*          /api/users/*     /api/messages/*          │
│         │                    │          /api/conversations/*     │
│         ▼                    ▼          /socket.io/*             │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐         │
│  │ Auth Service │   │ User Service │   │ Chat Service │         │
│  │  Port 5001   │   │  Port 5002   │   │  Port 5003   │         │
│  │ HPA: 2→6    │   │ HPA: 2→4    │   │ HPA: 2→8    │         │
│  │ 128-256Mi   │   │ 128-256Mi   │   │ 256-512Mi   │         │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘         │
│         │                  │                  │                │
│         └──────────────────┴──────────────────┘                │
│                            │                                    │
│              ┌─────────────┼─────────────┐                     │
│              │             │             │                      │
│              ▼             ▼             ▼                      │
│         ┌─────────┐  ┌─────────┐  ┌─────────────┐             │
│         │ MongoDB │  │  Redis  │  │ Prometheus  │              │
│         │  :27017 │  │  :6379  │  │   :9090     │              │
│         └─────────┘  └─────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

#### Why 4 Services (Not 3, Not 8)?

| Service | Responsibility | Scaling Need |
|---------|---------------|--------------|
| **API Gateway** | Reverse proxy, routing, CORS | Low (lightweight, 2 replicas fixed) |
| **Auth Service** | Registration, login, JWT, refresh | Medium (login spikes during peak hours) |
| **User Service** | Search, listing, pagination | Low (read-heavy, cacheable) |
| **Chat Service** | Messages, conversations, Socket.IO, WebSockets | **High** (holds persistent connections, most resource-intensive) |

The chat-service scales to 8 pods because it holds WebSocket connections in memory. Auth can spike to 6 pods during login surges. User-service rarely needs more than 4 pods.

---

### 3.3 API Gateway — The Critical Proxy Layer

The gateway is the **single entry point** for all client traffic. Key implementation details:

**REST Proxying (http-proxy-middleware v3):**
```javascript
app.use("/api/auth", createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { "^/": "/api/auth/" }, // Re-add Express-stripped mount prefix
}));
```

**WebSocket Proxying (raw http-proxy):**
```javascript
// http-proxy-middleware v3 CANNOT reliably proxy WebSocket upgrades
// due to path mangling bugs. Raw http-proxy gives direct control.
const wsProxy = httpProxy.createProxyServer({
  target: CHAT_SERVICE_URL,
  ws: true,
  changeOrigin: true,
});

// Intercept HTTP upgrade events at the server level
server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/socket.io")) {
    wsProxy.ws(req, socket, head);
  } else {
    socket.destroy(); // Reject non-Socket.IO upgrades
  }
});
```

**Why two proxy libraries?** `http-proxy-middleware` v3 handles REST beautifully but mangles WebSocket upgrade paths (`/socket.io/socket.io/` duplication). Raw `http-proxy` gives byte-level control over the upgrade handshake.

---

### 3.4 Data Flow — Complete Request Lifecycle

**Sending a Message (Alice → Bob):**

```
1. Alice (Flutter) → POST /api/messages/:bobId
                     Header: Authorization: Bearer <JWT>

2. NGINX Ingress → routes /api/* to gateway-service:5000

3. API Gateway → matches /api/messages → proxy to chat-service:5003
   (pathRewrite restores /api/messages/:bobId)

4. Chat Service authMiddleware → verifies JWT → attaches req.user

5. messageController.sendMessage():
   a. Find or create Conversation between Alice & Bob
   b. Check if Bob is online via userSocketMap
   c. Create Message document (status: "delivered" if online, "sent" if offline)
   d. Update conversation.lastMessage and lastMessageAt
   e. If Bob online: io.to(bobSocketId).emit("newMessage", message)
   f. Return 201 { message } to Alice

6. Bob's Socket.IO client receives "newMessage" event
   → Bob's UI renders the message in real-time

7. Bob opens the conversation
   → PUT /api/messages/:convId/seen
   → Bulk-update status → "seen"
   → io.to(aliceSocketId).emit("messagesSeen", { conversationId })
   → Alice's UI updates ticks from gray to violet
```

---

## 4. Technology Stack Explanation

### 4.1 Backend Technologies

| Technology | Purpose | Why Chosen Over Alternatives |
|-----------|---------|------------------------------|
| **Node.js 20** | Server runtime | Non-blocking I/O ideal for real-time chat. V8's event loop handles thousands of concurrent WebSocket connections efficiently. Python (Django) would be slower for WebSockets; Go lacks the npm ecosystem. |
| **Express.js** | HTTP framework | Minimal, unopinionated, massive middleware ecosystem. Fastify is faster but less mature for proxy middleware. |
| **Socket.IO** | Real-time WebSockets | Auto-reconnection, room management, fallback to polling, Redis adapter for multi-pod scaling. Raw WebSockets would require building all of this manually. |
| **MongoDB 7** | Primary database | Flexible schema for evolving message/conversation models. Document structure maps naturally to JSON API responses. PostgreSQL would add ORM complexity for no benefit at this scale. |
| **Redis 7 Alpine** | Socket.IO adapter + Pub/Sub | Ultra-low-latency in-memory store. Socket.IO's `@socket.io/redis-adapter` broadcasts events across multiple chat-service pods. Alternatives (RabbitMQ, Kafka) are overkill for this use case. |
| **Mongoose** | MongoDB ODM | Schema validation, middleware hooks, query building. Prevents raw query injection and enforces data contracts. |
| **jsonwebtoken** | JWT creation/verification | Industry-standard Node.js JWT library. Used for both access and refresh tokens. |
| **bcryptjs** | Password hashing | Adaptive hashing algorithm with configurable salt rounds. Argon2 is newer but has fewer bindings. |
| **Joi** | Input validation | Declarative schema validation with clear error messages. Superior to manual `if/else` chains. |
| **express-rate-limit** | Brute-force protection | Simple middleware: 5 login attempts per minute per IP. |
| **http-proxy-middleware** | REST reverse proxy | Express-native proxy middleware for REST API routing in the gateway. |
| **http-proxy** | WebSocket proxy | Low-level proxy for reliable WebSocket upgrade handling (bypass middleware path bugs). |
| **prom-client** | Prometheus metrics | Official Node.js Prometheus client. Exposes counters, histograms, and gauges at `/metrics`. |
| **ioredis** | Redis client | Full-featured Redis client with cluster support. Used for Socket.IO adapter connections. |

### 4.2 Frontend Technologies

| Technology | Purpose | Why Chosen |
|-----------|---------|------------|
| **React 18** | UI library | Component model, hooks, massive ecosystem. Vue would work equally well but React has broader hiring pool. |
| **Vite** | Build tool | 10-100x faster than Webpack. Native ESM dev server with instant HMR. |
| **Tailwind CSS v4** | Styling | Utility-first CSS with purging. v4 uses `@tailwindcss/vite` plugin (no PostCSS). |
| **Axios** | HTTP client | Interceptors for auto token refresh. Fetch API lacks built-in interceptor support. |
| **Socket.IO Client** | WebSocket client | Matches the server-side Socket.IO. Auto-reconnection and event API. |
| **emoji-picker-react** | Emoji input | Pre-built dark-theme emoji selector. |

### 4.3 Flutter Technologies

| Technology | Purpose | Why Chosen |
|-----------|---------|------------|
| **Flutter 3.x** | Cross-platform UI | Single codebase for Windows, macOS, Android, iOS. |
| **Provider** | State management | Lightweight, React-like context injection. BLoC/Riverpod add unnecessary complexity here. |
| **Dio** | HTTP client | Interceptor support for JWT auto-refresh (mirrors Axios pattern). |
| **socket_io_client** | WebSocket client | Dart Socket.IO implementation compatible with the Node.js server. |
| **SharedPreferences** | Token storage | Key-value store for JWT persistence across app restarts. |
| **Google Fonts** | Typography | Consistent, premium font rendering across platforms. |

### 4.4 DevOps Technologies

| Technology | Purpose | Why Chosen |
|-----------|---------|------------|
| **Docker** | Containerization | Consistent environments across dev/staging/prod. Multi-stage builds minimize image size. |
| **Docker Compose** | Local orchestration | Single `docker-compose up` spins up all 11 services. |
| **Kubernetes (EKS)** | Container orchestration | Auto-healing, rolling updates, HPA scaling, service discovery. Docker Swarm lacks the ecosystem. |
| **Terraform** | Infrastructure as Code | Declarative AWS provisioning. CloudFormation is AWS-locked; Terraform is cloud-agnostic. |
| **GitHub Actions** | Cloud CI/CD | Free for public repos, native Docker/K8s actions, matrix builds. |
| **Jenkins** | Local CI/CD | Self-hosted pipeline for local testing via Ngrok webhooks. |
| **Prometheus** | Metrics collection | Pull-based monitoring, PromQL queries, time-series DB. Self-hosted = zero cost. |
| **Grafana** | Metrics visualization | 8-panel pre-built dashboard. Auto-provisioned datasource on boot. |
| **Loki** | Log aggregation | Grafana-native log storage. Cheaper than Elasticsearch for log search. |
| **Promtail** | Log collector | DaemonSet that scrapes Docker container logs and ships to Loki. |
| **Docker Scout** | CVE scanning | GitHub Actions-native vulnerability scanner for Docker images. |
| **Trivy** | CVE scanning | Aqua Security scanner in Jenkins pipeline. Catches Critical/High CVEs. |
| **k6** | Load testing | Modern load testing tool. Scripted in JavaScript, supports WebSocket. |
| **Nginx** | Web server / reverse proxy | Serves React static build, proxies API/WebSocket to backend in Docker. |
| **Ngrok** | Tunnel | Exposes local Jenkins to GitHub webhooks. Also exposes local API to mobile devices. |

---

## 5. Development Details

### 5.1 Folder Structure

```
chattining-application/
│
├── 📱 flutter_chat_app/              ← Flutter Desktop/Mobile Client
│   └── lib/
│       ├── config/                   (API URLs, theme)
│       ├── models/                   (UserModel)
│       ├── providers/                (AuthProvider, ChatProvider)
│       ├── screens/                  (Login, Register, Chat)
│       ├── services/                 (AuthService, SocketService, ApiService)
│       └── main.dart
│
├── ⚛️  frontend/                      ← React Web Client (Vite)
│   ├── src/
│   │   ├── components/               (ChatPage, ChatSidebar, ChatWindow)
│   │   ├── context/                  (AuthContext)
│   │   ├── hooks/                    (useSocket)
│   │   └── services/                 (api.js — Axios instance)
│   ├── nginx.conf                    ← Production reverse proxy
│   └── Dockerfile                    ← Multi-stage build
│
├── 🔧 services/                      ← Microservices (Node.js)
│   ├── api-gateway/                  Port 5000 — Reverse proxy
│   │   ├── server.js                 (Express + http-proxy-middleware + http-proxy)
│   │   ├── config/metrics.js         (Prometheus gateway_proxy_errors_total)
│   │   └── Dockerfile
│   │
│   ├── auth-service/                 Port 5001 — JWT, login, register
│   │   ├── server.js                 (Express + Mongoose)
│   │   ├── controllers/authController.js (register, login, refresh, logout, getMe)
│   │   ├── middleware/authMiddleware.js (Bearer token verification)
│   │   ├── models/User.js            (bcrypt, refreshToken field)
│   │   ├── routes/authRoutes.js       (rate limiter + routes)
│   │   ├── config/metrics.js         (auth_login_attempts_total, auth_registrations_total)
│   │   └── Dockerfile
│   │
│   ├── user-service/                 Port 5002 — Search, listing
│   │   ├── server.js
│   │   ├── controllers/userController.js (hybrid search, pagination)
│   │   ├── models/User.js            (text index: name + email)
│   │   ├── config/metrics.js         (user_search_total)
│   │   └── Dockerfile
│   │
│   └── chat-service/                 Port 5003 — Messages, Socket.IO
│       ├── server.js                 (Express + HTTP server + Socket.IO init)
│       ├── socket/socket.js          (initSocket, userSocketMap, Redis adapter)
│       ├── controllers/
│       │   ├── messageController.js  (send, get, markSeen, markDelivered)
│       │   └── conversationController.js (list, create group)
│       ├── models/
│       │   ├── Message.js            (status enum, compound indexes)
│       │   └── Conversation.js       (participants, group support)
│       ├── config/metrics.js         (chat_messages_sent_total, active_websocket_connections)
│       └── Dockerfile
│
├── ☸️  k8s/
│   └── production/                   ← 16 K8s manifests (35 documents)
│       ├── namespace.yaml
│       ├── configmap.yaml            (chattining-config)
│       ├── secrets.yaml              (chattining-secrets — template)
│       ├── redis-deployment.yaml
│       ├── gateway-deployment.yaml
│       ├── auth-deployment.yaml      (+ HPA 2→6)
│       ├── user-deployment.yaml      (+ HPA 2→4)
│       ├── chat-deployment.yaml      (+ HPA 2→8)
│       ├── frontend-deployment.yaml
│       ├── frontend-service.yaml
│       ├── frontend-hpa.yaml
│       ├── prometheus-deployment.yaml (10Gi PVC)
│       ├── grafana-deployment.yaml   (auto-provisioned)
│       ├── loki-deployment.yaml      (5Gi PVC)
│       ├── promtail-daemonset.yaml   (DaemonSet + RBAC)
│       └── ingress.yaml              (TLS, sticky sessions, WebSocket)
│
├── 🏗️  infra/                         ← Terraform IaC
│   ├── main.tf                       (AWS provider, S3 backend)
│   ├── vpc.tf                        (VPC, 4 subnets, NAT Gateway)
│   ├── eks.tf                        (EKS cluster, managed node group)
│   ├── ecr.tf                        (5 ECR repositories)
│   ├── variables.tf                  (9 configurable inputs)
│   └── outputs.tf                    (kubectl command, ECR URLs)
│
├── 📊 monitoring/
│   ├── prometheus/prometheus.yml     ← Scrape config (4 targets)
│   ├── promtail/promtail-config.yml  ← Docker log scraper
│   └── grafana/
│       ├── provisioning/             (datasource + dashboard auto-config)
│       └── dashboards/microservices.json (8-panel dashboard)
│
├── 🔬 tests/
│   └── load/
│       ├── http-load.js              ← k6 REST load test (5000 VUs)
│       └── websocket-load.js         ← k6 WebSocket load test
│
├── 🔄 .github/workflows/
│   ├── docker-publish.yml            ← Build 5 images (matrix)
│   └── deploy.yml                    ← Full CI/CD → EKS
│
├── 🐳 docker-compose.yml            ← 11 services local orchestration
├── 📋 Jenkinsfile                    ← Parallel build + Trivy scan
└── 🏗️  render.yaml                   ← Render.com deployment config
```

### 5.2 Important Module Deep Dives

#### socket/socket.js — The Heart of Real-Time

This is the most complex module in the project. Key responsibilities:

1. **Socket.IO Server Initialization** with CORS, transport config, and keepalive settings
2. **Redis Adapter Attachment** — creates pub/sub client pair for multi-pod broadcasting
3. **JWT Authentication Middleware** — `io.use()` verifies tokens before allowing connections
4. **Connection Handler:**
   - Maps userId → socket array (multi-device support)
   - Updates Prometheus gauge (`activeWebsocketConnections`)
   - Broadcasts online users list
   - **Automated Delivery System:** queries all `sent` messages for the user, bulk-updates to `delivered`, and notifies original senders
5. **Event Handlers:** `join chat`, `typing`, `stop typing`, `disconnect`

#### config/metrics.js — Prometheus Instrumentation

Each service has its own metrics module exposing:
- `http_request_duration_seconds` (Histogram, 8 buckets: 10ms→5s)
- `http_requests_total` (Counter)
- Service-specific counters (login attempts, messages sent, etc.)
- `collectDefaultMetrics` — Node.js CPU, memory, event loop lag

---

## 6. Database Design

### 6.1 MongoDB Collections

**Database:** `chatApp` (shared across all services — collection-level isolation)

#### Users Collection
```javascript
{
  _id: ObjectId,
  name: String (required, min 2 chars),
  email: String (required, unique, lowercase),
  password: String (bcrypt hash, select: false),
  refreshToken: String (nullable — for token rotation),
  connectCode: String (unique, auto-generated),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
// Indexes: { name: "text", email: "text" }, { email: 1 }
```

#### Messages Collection
```javascript
{
  _id: ObjectId,
  conversationId: ObjectId (ref: Conversation, required),
  senderId: ObjectId (ref: User, required),
  receiverId: ObjectId (ref: User, required),
  text: String (required),
  status: String (enum: ['sent', 'delivered', 'seen'], default: 'sent'),
  isSeen: Boolean (default: false — legacy compat),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
// Indexes:
//   { senderId: 1, receiverId: 1, createdAt: 1 }   — fast message history
//   { receiverId: 1, senderId: 1, createdAt: 1 }   — reverse lookup
//   { conversationId: 1, createdAt: 1 }             — conversation view
```

#### Conversations Collection
```javascript
{
  _id: ObjectId,
  participants: [ObjectId] (ref: User),
  lastMessage: String,
  lastMessageAt: Date (default: now),
  isGroup: Boolean (default: false),
  groupName: String (optional),
  groupAdmin: ObjectId (optional, ref: User),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
// Indexes: { participants: 1 }, { lastMessageAt: -1 }
```

### 6.2 Why Shared Database (Not Database-per-Service)?

**Decision:** All 3 data services (auth, user, chat) connect to the same MongoDB instance with collection-level isolation.

**Rationale:** At this scale (thousands of users, not millions), database-per-service would:
- Triple the infrastructure cost (3 MongoDB instances)
- Complicate cross-service queries
- Require event sourcing for data consistency

The pragmatic middle ground: **shared database, isolated collections**. Each service only accesses its own collections via its own Mongoose models. No cross-service joins.

**When to migrate:** If the chat-service database exceeds the capacity of a single MongoDB replica set (typically >500GB), split it into its own cluster.

---

## 7. Real-Time Communication Deep Dive

### 7.1 Socket.IO Architecture

```
Client (React/Flutter)
  │
  │ 1. HTTP Polling handshake (?EIO=4&transport=polling)
  │    → Gets session ID (sid)
  │
  │ 2. WebSocket Upgrade (Connection: Upgrade)
  │    → Persistent bidirectional channel
  │
  ▼
API Gateway (Port 5000)
  │
  │ server.on("upgrade") → wsProxy.ws(req, socket, head)
  │
  ▼
Chat Service (Port 5003)
  │
  │ io.use() → JWT verification middleware
  │ io.on("connection") → handler
  │
  ▼
Redis Adapter (@socket.io/redis-adapter)
  │
  │ Pub/Sub broadcasting across all chat-service pods
  │
  ▼
All Chat Service Pods
```

### 7.2 Why Polling-First Transport?

Socket.IO uses a two-phase connection:
1. **HTTP Long-Polling** — initial handshake and session establishment
2. **WebSocket Upgrade** — persistent bidirectional channel

This is intentional. Many corporate firewalls/proxies block WebSocket upgrades. Polling ensures connectivity, then transparently upgrades to WebSocket for performance.

Configuration in the project:
```javascript
transports: ["polling", "websocket"],
allowUpgrades: true,
```

### 7.3 Redis Adapter — Multi-Pod Broadcasting

**Problem:** When chat-service scales to 8 pods, each pod has its own in-memory `userSocketMap`. If Alice is connected to Pod A and Bob to Pod B, Pod A can't emit to Bob's socket.

**Solution:** `@socket.io/redis-adapter` creates a Redis Pub/Sub channel. When Pod A emits an event, Redis broadcasts it to ALL pods. Pod B receives the event and delivers it to Bob's local socket.

```javascript
const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

**Graceful Fallback:** If `REDIS_URL` is not set, Socket.IO runs in single-process mode. This enables local development without Redis.

### 7.4 WebSocket Events Reference

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `connection` | Client → Server | JWT in `auth.token` | Authenticate and register user online |
| `join chat` | Client → Server | `conversationId` | Join a Socket.IO room for typing events |
| `newMessage` | Server → Client | Message JSON | Deliver a new message in real-time |
| `typing` | Client → Server → Client | `conversationId` | Show typing indicator to the other user |
| `stop typing` | Client → Server → Client | `conversationId` | Hide typing indicator |
| `getOnlineUsers` | Server → All Clients | `[userId1, userId2, ...]` | Update online/offline status |
| `messagesDelivered` | Server → Client | `{ receiverId }` | Update tick from ✓ to ✓✓ |
| `messagesSeen` | Server → Client | `{ conversationId }` | Update tick from ✓✓ gray to ✓✓ violet |
| `disconnect` | Client → Server | — | Remove from `userSocketMap`, broadcast offline |

---

## 8. Challenges & Solutions

### 8.1 WebSocket Proxy Path Mangling

**Problem:** `http-proxy-middleware` v3 in Express strips the mount prefix from `req.url`. When mounted at `/socket.io`, the proxy sent requests to `/` instead of `/socket.io` on the downstream chat-service. This caused Socket.IO handshake failures.

**Solution:** Used raw `http-proxy` for WebSocket traffic, mounted at the root level:
```javascript
app.use((req, res, next) => {
  if (req.path.startsWith('/socket.io')) {
    wsProxy.web(req, res);  // Bypass Express mount prefix stripping
  } else {
    next();
  }
});
```

**Lesson:** Proxying WebSocket upgrades through middleware layers requires understanding how each layer modifies `req.url`. When in doubt, go lower-level.

---

### 8.2 `pathRewrite` Bug in Gateway Proxying

**Problem:** `http-proxy-middleware` v3 receives `req.url` already stripped of the Express mount prefix. The old `pathRewrite: { "^/api/auth": "/api/auth" }` was a no-op because `req.url` no longer started with `/api/auth`.

**Solution:** Changed to `pathRewrite: { "^/": "/api/auth/" }` — the proxy receives `/` and rewrites it to `/api/auth/`, restoring the correct downstream path.

**Lesson:** Always test proxy configurations end-to-end with real requests, not just unit tests.

---

### 8.3 Circular Dependency in Socket.IO Imports

**Problem:** `messageController.js` imported `io` directly from `socket.js` at the module level. But `io` isn't initialized until `server.js` calls `initSocket()`, which happens after all imports. Result: `io` was `undefined`.

**Solution:** Changed from direct import to a lazy accessor pattern:
```javascript
// Before (broken):
const { io } = require("../socket/socket");  // undefined at import time

// After (working):
const { getIO } = require("../socket/socket");
// Inside handler:
const io = getIO();  // Called at runtime, after initSocket()
```

**Lesson:** In Node.js, circular dependencies + singletons require lazy initialization patterns.

---

### 8.4 Socket.IO Self-Initializing Pattern

**Problem:** The original monolithic `socket.js` created its own `express()` app and `http.createServer()` internally. This couldn't coexist with the chat-service's own server — two servers fighting for the same port.

**Solution:** Refactored to an injectable pattern:
```javascript
// Before (self-contained):
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// After (injectable):
const initSocket = (server) => {
  io = new Server(server, { ... });
};
```

**Lesson:** Modules should not create infrastructure (servers, connections). They should receive infrastructure via injection.

---

### 8.5 Minikube on Windows Hyper-V

**Problem:** Minikube on Windows defaulted to the Hyper-V driver, which required Admin privileges and conflicted with Docker Desktop's own VM.

**Solution:** Forced the Docker driver: `minikube start --driver=docker`

---

### 8.6 Jenkins Docker Engine Crashes

**Problem:** Jenkins pipeline failed with `Cannot connect to Docker daemon` because the Jenkins container didn't have access to the host's Docker socket.

**Solution:** Mounted the Docker socket: `-v /var/run/docker.sock:/var/run/docker.sock`

---

### 8.7 Port Conflicts in Docker Compose

**Problem:** Prometheus default port 9090 was occupied by another service on the host.

**Solution:** Remapped to 9091: `"9091:9090"` in `docker-compose.yml`. Changed monitoring URLs accordingly.

---

## 9. Deployment — Step by Step

> ⚠️ **This is the most critical section for interviews. Master every detail here.**

### 9.1 Deployment Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT PIPELINE                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  git push main                                                     │
│       │                                                            │
│       ▼                                                            │
│  ┌─────────────────────────────────────────────┐                  │
│  │         GitHub Actions CI/CD                 │                  │
│  │                                              │                  │
│  │  Stage 1: Test (npm test × 3 services)       │                  │
│  │       │                                      │                  │
│  │  Stage 2: Build (matrix × 5 images)          │                  │
│  │       │                                      │                  │
│  │  Stage 2b: Docker Scout CVE scan             │                  │
│  │       │                                      │                  │
│  │  Stage 2c: Push to ECR + Docker Hub          │                  │
│  │       │                                      │                  │
│  │  Stage 3: Deploy to EKS                      │                  │
│  │       │                                      │                  │
│  │  Stage 3b: kubectl rollout status            │                  │
│  └───────┼──────────────────────────────────────┘                  │
│          │                                                         │
│          ▼                                                         │
│  ┌─────────────────────────────────────────────┐                  │
│  │            AWS Infrastructure                │                  │
│  │                                              │                  │
│  │  VPC (10.0.0.0/16)                           │                  │
│  │  ├── 2 Public Subnets (NAT, LB)             │                  │
│  │  └── 2 Private Subnets (EKS Workers)        │                  │
│  │                                              │                  │
│  │  EKS Cluster (K8s 1.29)                      │                  │
│  │  ├── 2-4 t3.medium worker nodes             │                  │
│  │  ├── NGINX Ingress Controller                │                  │
│  │  ├── cert-manager (Let's Encrypt TLS)        │                  │
│  │  └── 16 K8s manifests applied                │                  │
│  │                                              │                  │
│  │  ECR (5 repositories, immutable tags)        │                  │
│  └──────────────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────────────────┘
```

### 9.2 Infrastructure Setup with Terraform

#### Step 1: Prerequisites
```bash
# Install
brew install terraform           # or choco install terraform
brew install awscli               # or choco install awscli
aws configure                     # Set access key, secret, region (ap-south-1)
```

#### Step 2: Provision AWS Infrastructure
```bash
cd infra/

# Initialize Terraform (downloads AWS provider)
terraform init

# Preview what will be created
terraform plan -out=plan.tfplan

# Create the infrastructure (~15 minutes)
terraform apply plan.tfplan
```

**What Terraform Creates:**

| Resource | Details | Cost |
|----------|---------|------|
| **VPC** | 10.0.0.0/16, 2 public + 2 private subnets, NAT Gateway | ~$30/month (NAT) |
| **EKS Cluster** | Managed K8s 1.29 control plane | ~$72/month |
| **Node Group** | 2-4 t3.medium EC2 instances (autoscaling) | ~$60-120/month |
| **5 ECR Repos** | Immutable tags, scan-on-push, lifecycle cleanup | ~$1/month |
| **OIDC Provider** | IAM Roles for Service Accounts (IRSA) | Free |
| **Total** | | **~$163-223/month** |

#### Step 3: Configure kubectl
```bash
aws eks update-kubeconfig --name chattining-cluster --region ap-south-1
kubectl get nodes  # Verify connection
```

#### Step 4: Install Cluster Add-ons
```bash
# NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/aws/deploy.yaml

# cert-manager for auto TLS
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml
```

---

### 9.3 CI/CD Pipeline — GitHub Actions (deploy.yml)

#### Pipeline Stages

**Stage 1 — Test:**
```yaml
- name: Test Auth Service
  working-directory: ./services/auth-service
  run: |
    npm ci
    npm test --if-present
```
All 3 data services (auth, user, chat) run `npm test` in parallel.

**Stage 2 — Build + Scan + Push (Matrix Strategy):**
```yaml
strategy:
  matrix:
    include:
      - service: api-gateway
        context: ./services/api-gateway
        dockerhub: mittal122/chattining-gateway
        ecr_repo: chattining-gateway
      # ... 4 more services
```

This spins up **5 parallel jobs** — one per microservice. Each job:
1. Builds the Docker image with `docker/build-push-action@v5`
2. Tags with both `git SHA` and `latest`
3. Pushes to **both** AWS ECR and Docker Hub (dual registry)
4. Scans with Docker Scout for Critical/High CVEs
5. Uses GHA cache (`type=gha,scope=${{ matrix.service }}`) for fast rebuilds

**Stage 3 — Deploy to EKS:**
```yaml
deploy:
  needs: [build]
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

Only deploys on `main` branch pushes (not PRs). Steps:
1. Configure AWS credentials
2. Update kubeconfig for EKS
3. **sed-replace** image tags from `:latest` to `:$GIT_SHA` in K8s manifests
4. `kubectl apply` all manifests in dependency order
5. `kubectl rollout status` waits for healthy rollout (3-min timeout per service)
6. Verify: `kubectl get pods`, `kubectl get svc`, `kubectl get hpa`, `kubectl get ingress`

#### Why Dual Registry (ECR + Docker Hub)?
- **ECR:** Production deployment source (private, immutable tags, CVE scanning)
- **Docker Hub:** Public images for external contributors and fallback

---

### 9.4 CI/CD Pipeline — Jenkins (Local)

The Jenkins pipeline runs on your local machine, triggered by GitHub webhooks via Ngrok.

**Flow:**
```
git push → GitHub Webhook → Ngrok Tunnel → Local Jenkins → Docker Build → Docker Hub
```

**Jenkinsfile Stages:**
1. **Checkout Code** — `checkout scm`
2. **Build Microservice Images** (5 parallel stages) — `docker.build()`
3. **Push All Images** — `docker.withRegistry()` → push `:latest` and `:$BUILD_NUMBER`
4. **Security Scan (Trivy)** — scan all 5 images for Critical/High CVEs

---

### 9.5 Kubernetes Manifests — What Gets Deployed

#### Namespace
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: chattining
```

#### ConfigMap (chattining-config)
```yaml
data:
  PORT: "5000"
  AUTH_SERVICE_URL: "http://auth-service:5001"
  USER_SERVICE_URL: "http://user-service:5002"
  CHAT_SERVICE_URL: "http://chat-service:5003"
  CORS_ORIGIN: "https://chat.yourdomain.com"
  REDIS_URL: "redis://redis:6379"
```

#### Secrets (chattining-secrets)
```yaml
data:
  JWT_SECRET: <base64-encoded>
  MONGO_URI: <base64-encoded>
```
> ⚠️ The repo contains a **template**. Real secrets are injected via `kubectl create secret` or AWS Secrets Manager.

#### Service-level Deployment Pattern
Each microservice deployment includes:
- **Deployment:** Replicas, container image, env from ConfigMap/Secrets, resource limits, probes
- **Service:** ClusterIP (internal-only) exposing the service port
- **HPA:** Min/max pods, CPU/memory targets, scale-down stabilization

Example (auth-service):
```yaml
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # Zero-downtime deployments
  template:
    spec:
      containers:
        - name: auth-service
          image: mittal122/chattining-auth:latest
          ports:
            - containerPort: 5001
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 256Mi }
          startupProbe:
            httpGet: { path: /health, port: 5001 }
            failureThreshold: 10
            periodSeconds: 5
          readinessProbe:
            httpGet: { path: /health, port: 5001 }
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /health, port: 5001 }
            periodSeconds: 30
```

#### HPA Configuration
```yaml
spec:
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # 5-min cooldown prevents flapping
```

#### Ingress — The Single Entry Point
```yaml
spec:
  ingressClassName: nginx
  tls:
    - hosts: [chat.yourdomain.com]
      secretName: chattining-tls
  rules:
    - host: chat.yourdomain.com
      http:
        paths:
          - path: /api        → gateway-service:5000
          - path: /socket.io  → gateway-service:5000
          - path: /           → frontend-service:80  # Catch-all (last)
```

Key annotations:
- **Sticky sessions:** Cookie-based (`CHATTINING_STICKY`) for Socket.IO pod affinity
- **WebSocket timeouts:** 3600s proxy read/send timeout
- **TLS:** cert-manager auto-provisions Let's Encrypt certificates

---

### 9.6 Scaling Strategy

| Service | Min Pods | Max Pods | CPU Target | Memory Target | Rationale |
|---------|----------|----------|------------|---------------|-----------|
| API Gateway | 2 | 2 (fixed) | — | — | Lightweight proxy, no HPA needed |
| Auth Service | 2 | 6 | 65% | — | Login spikes during morning/evening |
| User Service | 2 | 4 | 65% | — | Read-heavy, rarely CPU-bound |
| Chat Service | 2 | 8 | 65% | 75% | WebSocket connections consume memory |
| Frontend | 2 | 4 | 65% | — | Static file serving, light load |

**Node-level scaling:** EKS managed node group autoscales from 2→4 `t3.medium` instances based on pod scheduling pressure.

---

### 9.7 Monitoring Stack

#### Prometheus
- **Scrape interval:** 15 seconds
- **Retention:** 30 days (`--storage.tsdb.retention.time=30d`)
- **Storage:** 10Gi PersistentVolumeClaim
- **Targets:** 4 services (gateway, auth, user, chat) at `/metrics`

#### Grafana Dashboard (8 Panels)

| Panel | Metric | Type | Purpose |
|-------|--------|------|---------|
| HTTP Request Rate | `http_requests_total` | Timeseries | Traffic volume per service |
| Latency P95 | `http_request_duration_seconds` | Timeseries | Performance regression detection |
| Active WebSockets | `chat_active_websocket_connections` | Stat gauge | Live online user count |
| Messages Sent | `chat_messages_sent_total` | Stat counter | Chat activity volume |
| Login Attempts | `auth_login_attempts_total` | Timeseries | Success/failure ratio, brute-force detection |
| Registrations | `auth_registrations_total` | Stat counter | User growth tracking |
| Memory Usage | `process_resident_memory_bytes` | Timeseries | Memory leak detection per service |
| Gateway Errors | `gateway_proxy_errors_total` | Timeseries | Downstream service failures |

**Access:** Grafana at `http://localhost:3001` (Docker) or NodePort `31001` (K8s). Login: `admin`/`admin`.

#### Loki + Promtail (Centralized Logging)
- **Loki:** Log aggregation backend (30-day retention, 5Gi PVC)
- **Promtail:** DaemonSet that scrapes Docker container logs and ships to Loki
- **Integration:** Added as second Grafana datasource alongside Prometheus
- **Query:** Grafana's Log Explorer can filter by service name, log level, keywords

---

### 9.8 Security Practices

| Practice | Implementation |
|----------|---------------|
| **Non-root containers** | All Dockerfiles create `appuser` (backend) or use `nginx` user (frontend). CIS Docker Benchmark 4.1 compliant. |
| **Secrets management** | JWT_SECRET and MONGO_URI in K8s Secrets (base64). Template in repo; real values via `kubectl create secret` or AWS Secrets Manager. |
| **CVE scanning** | Docker Scout (GHA) + Trivy (Jenkins) scan all 5 images for Critical/High vulnerabilities. |
| **CORS lockdown** | `CORS_ORIGIN` env var. Defaults to `*` in dev; locked to production domain in K8s ConfigMap. |
| **Rate limiting** | 5 login attempts per minute per IP via `express-rate-limit`. |
| **JWT minimization** | Payloads contain only `{ userId, email }` — no PII leakage. |
| **Password exclusion** | User queries always `.select("-password")`. Password field is `select: false` by default in Mongoose schema. |
| **Security headers** | Nginx adds `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`. |
| **Immutable image tags** | ECR repositories configured with `image_tag_mutability = "IMMUTABLE"`. Prevents tag overwriting attacks. |
| **ECR scan-on-push** | Every image pushed to ECR is automatically scanned for vulnerabilities. |
| **Healthchecks** | 3-tier K8s probes (startup, readiness, liveness) prevent traffic to unhealthy pods. |

---

### 9.9 Cost Considerations

#### AWS EKS Production

| Resource | Monthly Cost (USD) |
|----------|-------------------|
| EKS Control Plane | $72 |
| 2× t3.medium (On-Demand) | $60 |
| NAT Gateway | $30 |
| ECR Storage (5 repos × ~500MB) | $1 |
| ALB (via Ingress) | $20 |
| EBS (PVCs: 10Gi+5Gi+2Gi) | $2 |
| **Total** | **~$185/month** |

**Cost Optimization:**
- Use **Spot instances** for worker nodes (60-90% savings, risk: interruption)
- Use **single NAT Gateway** in dev/staging (vs. one per AZ in prod)
- Use **t3.small** instead of t3.medium for lower traffic
- **Free Tier Alternative:** Docker Compose on a single `t2.micro` EC2 instance (see `AWS_DEPLOY.md`)

---

### 9.10 Common Deployment Issues and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| `ImagePullBackOff` in pods | ECR image not found or IAM permissions | Verify ECR URI, check node IAM role has `ecr:GetAuthorizationToken` |
| `CrashLoopBackOff` in pods | App crashes on startup (missing env vars) | Check `kubectl logs <pod>`, verify ConfigMap/Secrets mounted |
| WebSocket connections dropping | No sticky sessions configured | Add Ingress annotations for cookie-based affinity |
| Socket.IO handshake fails | CORS mismatch in production | Update `CORS_ORIGIN` in ConfigMap to match your domain |
| SSL certificate not provisioned | cert-manager not installed or DNS not configured | Install cert-manager, verify DNS A record points to ALB |
| HPA not scaling | Metrics server not installed | Install `metrics-server` in the cluster |
| Prometheus can't scrape services | Network policy blocking or wrong service name | Verify service DNS names match Prometheus config targets |
| Grafana dashboard empty | Datasource not auto-provisioned | Check provisioning YAML mounted, restart Grafana pod |
| `OOMKilled` on chat-service | Too many WebSocket connections for memory limit | Increase memory limit or add more pods via HPA |

---

## 10. DevOps & System Design Concepts

### 10.1 Load Balancing

**Layer 7 (Application):** NGINX Ingress Controller acts as an L7 load balancer:
- Routes based on URL path (`/api/*` → gateway, `/` → frontend)
- Sticky sessions via cookies for Socket.IO pod affinity
- TLS termination at the edge

**Layer 4 (Transport):** AWS ALB (provisioned by Ingress Controller) distributes TCP connections across Ingress pods.

**Service-level:** Kubernetes ClusterIP services use `iptables` round-robin to distribute requests across pod replicas.

---

### 10.2 Horizontal vs. Vertical Scaling

| Type | This Project | When to Use |
|------|-------------|-------------|
| **Horizontal (HPA)** | Chat: 2→8 pods, Auth: 2→6 pods | When workload is stateless and parallelizable |
| **Vertical (VPA)** | Not yet implemented | When a single pod needs more CPU/memory (e.g., MongoDB) |
| **Node Autoscaling** | EKS: 2→4 t3.medium nodes | When pods can't be scheduled due to insufficient node resources |

---

### 10.3 Caching Strategy

**Current:** No explicit caching layer.

**Where caching would help:**
- **User search results:** Redis TTL cache (30-60s) for frequently searched names
- **Conversation list:** Cache the last 20 conversations per user
- **Static assets:** Nginx already sets 1-year cache for Vite-hashed `/assets/` files

**Why no Redis cache yet?** Redis is currently dedicated to Socket.IO adapter. Adding caching would require a separate Redis instance or namespaced keys to avoid interference.

---

### 10.4 Fault Tolerance & High Availability

| Mechanism | Implementation |
|-----------|---------------|
| **Multi-AZ deployment** | EKS worker nodes across 2 Availability Zones |
| **Pod redundancy** | Minimum 2 replicas per service |
| **Zero-downtime deploys** | `maxUnavailable: 0, maxSurge: 1` rolling updates |
| **Health probes** | Startup (prevents premature kills), Readiness (stops traffic), Liveness (restarts stuck) |
| **Graceful shutdown** | SIGTERM handlers close HTTP server + MongoDB connection. 10s timeout before force kill. |
| **Auto-healing** | K8s restarts crashed pods automatically |
| **Data persistence** | PVCs for Prometheus (10Gi), Grafana (2Gi), Loki (5Gi) |

---

### 10.5 Containerization & Orchestration

**Docker Multi-Stage Builds:**
```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
COPY package*.json ./
RUN npm install --omit=dev

# Stage 2: Production image
FROM node:20-alpine AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER appuser  # Non-root
CMD ["node", "server.js"]
```

**Why multi-stage?** Stage 1 installs ALL dependencies (including devDependencies for build). Stage 2 copies only production dependencies. Result: smaller, more secure images.

**Kubernetes Key Concepts Used:**
- **Deployments:** Declarative pod management with rolling updates
- **Services (ClusterIP):** Internal DNS-based service discovery
- **HPA:** CPU/memory-based autoscaling with scale-down stabilization
- **ConfigMaps:** Environment configuration injected as env vars
- **Secrets:** Sensitive data (JWT_SECRET, MONGO_URI) base64-encoded
- **PVCs:** Persistent storage for stateful services (Prometheus, Grafana, Loki)
- **Ingress:** External traffic routing with TLS, sticky sessions, WebSocket support
- **Namespace:** Resource isolation (`chattining` namespace)
- **DaemonSet:** Promtail runs one pod per node for log collection
- **RBAC:** ClusterRole + ServiceAccount for Promtail's node-level access

---

## 11. Interview Preparation Section

### 11.1 Common Questions & Answers

---

**Q: Tell me about your project.**

> Chattining is a production-grade real-time chat application built with a microservices architecture. It supports React web and Flutter mobile/desktop clients communicating via REST APIs and Socket.IO WebSockets. The backend is decomposed into 4 Node.js microservices — API Gateway, Auth, User, and Chat — orchestrated on AWS EKS with Terraform-provisioned infrastructure. It features WhatsApp-style message delivery status (sent/delivered/seen), multi-device support, Redis-backed cross-pod WebSocket broadcasting, and full observability via Prometheus, Grafana, and Loki. The CI/CD pipeline uses GitHub Actions for cloud builds and Jenkins for local testing, with Docker Scout and Trivy for container security scanning.

---

**Q: Why did you choose microservices over a monolith?**

> The monolithic backend was a single Node.js process handling auth, user search, chat messages, and WebSocket connections. This created three problems: (1) the chat-service, which holds persistent WebSocket connections, couldn't scale independently from auth/user services; (2) a crash in any feature took down the entire app; (3) deployments required rebuilding and restarting everything. By decomposing into 4 services, the chat-service can scale to 8 pods during peak usage while auth stays at 2 pods. Each service deploys independently — a fix to auth doesn't require restarting chat connections.

---

**Q: How does your WebSocket implementation handle horizontal scaling?**

> In a single-pod setup, the `userSocketMap` (in-memory JS object) tracks which socket belongs to which user. When we scale to multiple pods, Alice might connect to Pod A while Bob connects to Pod B. Pod A's `userSocketMap` doesn't know about Bob. We solve this with the `@socket.io/redis-adapter`. When Pod A emits a `newMessage` event, it publishes to a Redis Pub/Sub channel. ALL chat-service pods subscribe to this channel, so Pod B receives the event and delivers it to Bob's local socket. Redis acts as a cross-pod event bus without any application code changes — Socket.IO's adapter API is transparent.

---

**Q: Explain your JWT authentication flow.**

> We use a dual-token system: a short-lived access token (15 minutes) and a long-lived refresh token (7 days). The access token is sent in the `Authorization: Bearer` header for every API request. When it expires, the client's interceptor (Dio in Flutter, Axios in React) catches the 401 response, sends the refresh token to `POST /api/auth/refresh`, receives a new access token, and retries the original request — all transparently. The refresh token is stored in the User document in MongoDB. On logout, it's set to null, permanently invalidating it. This prevents token theft escalation: even if an access token is stolen, it expires in 15 minutes. Stealing a refresh token requires DB-level validation, which we control.

---

**Q: How does your message delivery status system work?**

> We implemented a WhatsApp-style triple-tick system using a Mongoose ENUM field (`status: ['sent', 'delivered', 'seen']`). When Alice sends a message, the controller checks the in-memory `userSocketMap` (or Redis in multi-pod) to see if Bob is online. If yes, the message is saved as `"delivered"` immediately and pushed via Socket.IO. If Bob is offline, it's saved as `"sent"`. When Bob connects, the Socket.IO `connection` handler queries all `sent` messages for Bob, bulk-updates them to `delivered`, and emits `messagesDelivered` to the original senders. When Bob opens a conversation, a REST call `PUT /api/messages/:convId/seen` bulk-updates to `seen` and emits `messagesSeen` via Socket.IO to Alice, who updates her UI ticks from gray to violet.

---

**Q: Why did you use an enum instead of boolean flags for message status?**

> With booleans (`isDelivered: true/false`, `isSeen: true/false`), you can represent an impossible state: `isSeen: true, isDelivered: false`. A message can't be read without being delivered first. The ENUM enforces a strict linear state machine: sent → delivered → seen. There's no way to skip a step or enter an invalid state. It's a single field to update instead of two, which also simplifies database queries.

---

**Q: Explain your CI/CD pipeline.**

> We have a dual CI/CD architecture. The primary pipeline is GitHub Actions: on `git push main`, it runs 3 stages. Stage 1 runs `npm test` for auth, user, and chat services. Stage 2 uses a matrix strategy to build 5 Docker images in parallel (gateway, auth, user, chat, frontend), scans each with Docker Scout for CVEs, and pushes to both AWS ECR and Docker Hub — dual registry for redundancy. Stage 3, only on `main` branch, uses `sed` to replace `:latest` tags with the git SHA in K8s manifests, runs `kubectl apply`, and waits for `kubectl rollout status` to confirm healthy deployments. The secondary pipeline is a local Jenkins instance triggered by GitHub webhooks via Ngrok, which builds images and pushes to Docker Hub with Trivy security scanning.

---

**Q: How did you implement Infrastructure as Code?**

> We use Terraform with the AWS provider to provision the entire cloud infrastructure declaratively. `vpc.tf` creates a VPC with 2 public subnets (for NAT and load balancers) and 2 private subnets (for EKS workers), with multi-AZ deployment. `eks.tf` provisions the managed EKS cluster with OIDC (for IRSA), a managed node group autoscaling between 2-4 t3.medium instances, and CoreDNS/vpc-cni/kube-proxy addons. `ecr.tf` creates 5 ECR repositories with immutable tags, scan-on-push, and lifecycle cleanup policies. State can be stored in S3 with DynamoDB locking for team workflows. The entire infrastructure deploys with `terraform init && terraform apply`.

---

**Q: How do you handle zero-downtime deployments?**

> Kubernetes rolling updates are configured with `maxUnavailable: 0` and `maxSurge: 1`. This means: first, a new pod with the updated image is created alongside the existing pods. Only after the new pod passes its startup probe, readiness probe, and liveness probe is the old pod terminated. At no point during the rollout are there fewer healthy pods than the desired replica count. We also have a 10-second graceful shutdown handler: when a pod receives SIGTERM, it stops accepting new connections, drains in-flight requests, closes MongoDB connections, and then exits. The HPA's `scaleDown.stabilizationWindowSeconds: 300` prevents premature scale-down during deployment turbulence.

---

### 11.2 Deep-Dive Technical Questions

---

**Q: How does Socket.IO's transport upgrade work?**

> Socket.IO connects in two phases. First, it establishes an HTTP long-polling connection (`?EIO=4&transport=polling`). This ensures connectivity even behind restrictive firewalls that block WebSocket upgrades. Once the polling connection is stable, Socket.IO sends a `probe` ping via WebSocket. If the WebSocket probe succeeds, it transparently upgrades to WebSocket and drops the polling transport. This upgrade is invisible to application code — the same event API works regardless of transport. In our Ingress configuration, we set `proxy-read-timeout: 3600` and sticky sessions via cookies to ensure the polling and WebSocket requests hit the same pod (required for the upgrade handshake).

---

**Q: What is IRSA and why do you use it?**

> IRSA (IAM Roles for Service Accounts) allows Kubernetes pods to assume AWS IAM roles without hardcoding credentials. In our EKS setup, `enable_irsa = true` creates an OIDC identity provider. This lets us create a Kubernetes ServiceAccount that's associated with an IAM role. When a pod uses that ServiceAccount, AWS STS issues temporary credentials automatically. We use this for ECR image pulling and could extend it for S3 access or Secrets Manager. The alternative — hardcoding `AWS_ACCESS_KEY_ID` in environment variables — is a security anti-pattern.

---

**Q: Explain the Prometheus metrics pipeline.**

> Each microservice uses `prom-client` to instrument its code. The `metricsMiddleware` Express middleware intercepts every request, measures response time, and records it in a Histogram (`http_request_duration_seconds`) with 8 buckets (10ms to 5s). Service-specific counters track business events: `auth_login_attempts_total` (with success/failed labels), `chat_messages_sent_total`, `chat_active_websocket_connections` (a Gauge, not Counter, since it can decrease). Every service exposes a `GET /metrics` endpoint in Prometheus exposition format. Prometheus scrapes these endpoints every 15 seconds (`scrape_interval: 15s`). Grafana queries Prometheus via PromQL — for example, `rate(http_requests_total[5m])` for request rate, or `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` for p95 latency.

---

**Q: How would you add end-to-end encryption?**

> I'd implement the Signal Protocol (Double Ratchet). Each user generates an asymmetric key pair (Curve25519). Public keys are exchanged via the server. Messages are encrypted on the sender's device before sending. The server stores ciphertext — it can never read message content. The challenge is key management: initial key exchange, key rotation, and multi-device support (each device needs its own key pair). Libraries like `libsignal-protocol-javascript` provide the primitives. Trade-offs: the server loses the ability to search message content, moderate content, or do server-side analytics.

---

**Q: How would you add group chat?**

> The schema already supports it. The `Conversation` model has `isGroup: Boolean`, `groupName: String`, and `groupAdmin: ObjectId`. The `Message` model has `conversationId` which works for both 1-to-1 and group. The `messageController.sendMessage()` already handles group messages — it broadcasts to all participants except the sender. Remaining work: (1) create group API (`POST /api/conversations/group`), (2) add/remove participants API, (3) group admin permissions, (4) update Flutter/React UI for group views, (5) cap group size (currently `MAX_GROUP_MEMBERS = 5`).

---

### 11.3 Scenario-Based Questions

---

**Q: The chat-service is running at 100% CPU. What do you do?**

> 1. **Immediate:** The HPA should automatically scale up (max 8 pods, 65% CPU target). Verify HPA is working: `kubectl get hpa -n chattining`.
> 2. **If HPA isn't scaling:** Check if metrics-server is installed. Check if nodes have capacity for new pods.
> 3. **If nodes are full:** EKS cluster autoscaler should add nodes (max 4). If not, check autoscaler config.
> 4. **Investigate root cause:** Check Grafana → HTTP Request Rate panel. Is it a traffic spike (legitimate) or a bug (infinite loop)? Check `kubectl logs` for the chat-service pod.
> 5. **Longer term:** Profile the code. Common causes: unoptimized MongoDB queries (missing indexes), WebSocket event storms, or memory leaks in Socket.IO rooms.

---

**Q: A user reports messages being received twice. How do you debug?**

> This is likely the anti-race condition bug. When a message is sent, both the HTTP response AND the Socket.IO `newMessage` event deliver it. The frontend should deduplicate by `msg._id`. Steps:
> 1. Check if the frontend's duplicate prevention code is working (compares `msg._id` before appending).
> 2. Check if the same Socket.IO event is being emitted multiple times (log on server).
> 3. Check if the Redis adapter is broadcasting to the same pod twice (unlikely, but possible with misconfigured adapter).
> 4. If using multiple tabs, check if `userSocketMap` has duplicate socket entries for the same device.

---

**Q: The Grafana dashboard shows p95 latency spiking to 2 seconds. How do you investigate?**

> 1. **Which service?** The Grafana panel shows per-service latency. Identify the culprit (auth? chat?).
> 2. **Check MongoDB:** Slow queries are the #1 cause. Run `db.currentOp()` to find slow queries. Check if indexes are being used: `db.messages.find({...}).explain("executionStats")`.
> 3. **Check Redis:** If chat-service, check Redis latency: `redis-cli --latency-history`.
> 4. **Check Node.js event loop:** The default metrics include `nodejs_eventloop_lag_seconds`. If high, the event loop is blocked by synchronous code.
> 5. **Check pod resources:** `kubectl top pods -n chattining`. Is any pod hitting memory/CPU limits?
> 6. **Check network:** Cross-AZ traffic between pods adds latency. Verify pod distribution across nodes.

---

## 12. Onboarding Guide for New Developers

### 12.1 Prerequisites

| Tool | Download | Purpose |
|------|----------|---------|
| **Git** | https://git-scm.com | Clone the repo |
| **Docker Desktop** | https://docker.com | Run all backend services |
| **Node.js 20** | https://nodejs.org | Local development |
| **Flutter SDK 3.x** | https://flutter.dev | Build mobile/desktop app |
| **ngrok** | https://ngrok.com | Expose local server to mobile |
| **kubectl** | https://kubernetes.io/docs/tasks/tools/ | K8s management (optional) |
| **Terraform** | https://terraform.io | Infrastructure provisioning (optional) |

### 12.2 Local Development Setup

#### Step 1: Clone
```powershell
git clone https://github.com/mittal122/chattining-application.git
cd "chattining-application"
```

#### Step 2: Start All Backend Services
```powershell
# Make sure Docker Desktop is running
docker-compose up -d

# Wait 30 seconds, then verify
docker ps
# Should show 11 containers running
```

#### Step 3: Verify Health
```powershell
# API Gateway
curl http://localhost:5000/health
# Expected: {"service":"api-gateway","status":"healthy",...}

# Prometheus
curl http://localhost:9091/-/ready
# Expected: Prometheus Server is Ready.

# Grafana
# Open http://localhost:3001 in browser → Login: admin/admin
```

#### Step 4: Test API
```powershell
# Register a user
curl -X POST http://localhost:5000/api/auth/register `
  -H "Content-Type: application/json" `
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:5000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"test@example.com","password":"password123"}'
```

#### Step 5: Run Flutter App (Optional)
```powershell
cd flutter_chat_app

# If testing on phone, start ngrok first:
ngrok http 5000
# Copy the https://xxx.ngrok-free.app URL

# Update API URL in flutter_chat_app/lib/config/api_config.dart

flutter pub get
flutter run          # Desktop
flutter run -d chrome  # Web
flutter build apk --release  # Android APK
```

### 12.3 Development Workflow

1. **Feature branches:** Create a branch from `main` for each feature
2. **Local testing:** `docker-compose up -d` runs the full stack
3. **Service-specific dev:** If only changing auth-service:
   ```powershell
   cd services/auth-service
   npm install
   npm run dev  # nodemon hot-reload
   ```
4. **Rebuild a single service:**
   ```powershell
   docker-compose up -d --build auth-service
   ```
5. **View logs:**
   ```powershell
   docker logs chat-chat -f  # Follow chat-service logs
   docker logs chat-gateway -f  # Follow gateway logs
   ```
6. **Stop everything:**
   ```powershell
   docker-compose down     # Preserve data
   docker-compose down -v  # Wipe all data
   ```

### 12.4 How to Deploy

#### Option A: Docker Compose on EC2 (Simple)
1. Launch a `t2.medium` EC2 instance with Docker installed
2. Clone the repo, run `docker-compose up -d`
3. Open port 5000 (API) and 3000 (frontend) in the security group

#### Option B: Kubernetes on EKS (Production)
1. Run Terraform: `cd infra && terraform apply`
2. Configure kubectl: `aws eks update-kubeconfig --name chattining-cluster`
3. Install Ingress Controller + cert-manager
4. Create secrets: `kubectl create secret generic chattining-secrets --from-literal=JWT_SECRET=... --from-literal=MONGO_URI=...`
5. Apply manifests: `kubectl apply -f k8s/production/`
6. Verify: `kubectl get pods -n chattining`

#### Option C: Push to main (CI/CD Auto-Deploy)
1. Ensure GitHub Secrets are configured (AWS keys, Docker Hub token)
2. `git push origin main`
3. GitHub Actions automatically: Test → Build → Scan → Push → Deploy
4. Monitor: `kubectl rollout status deployment/chat-service -n chattining`

### 12.5 Best Practices

1. **Never commit secrets.** Use environment variables, K8s Secrets, or AWS Secrets Manager.
2. **Always add indexes** for new MongoDB queries. Check with `.explain("executionStats")`.
3. **Log meaningfully.** Use the emoji-prefixed format: `📤 [MESSAGE SENT]`, `🔴 [LOGIN FAILED]`.
4. **Instrument new features.** Add Prometheus counters/histograms for any new endpoint.
5. **Test WebSocket changes end-to-end.** Unit tests can't catch proxy/adapter issues.
6. **Keep Dockerfiles multi-stage.** Separate build from runtime for smaller images.
7. **Update the progress report.** After completing a phase, add an entry to `PROJECT_PROGRESS_REPORT.md`.

---

> **End of Document.** This guide covers the complete lifecycle of the Chattining application — from understanding the architecture and features, through development and debugging, to production deployment on AWS EKS. Use it as your single source of truth for both development and interview preparation.
