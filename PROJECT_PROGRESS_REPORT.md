# Project Progress Report
**Project:** Chattining Application (React, Flutter, Microservices, Kubernetes)
**Goal:** Maintain a clear, structured, and continuously updated record of the entire development process.

---

## Phase 1
**Phase Name:** CI/CD & Enterprise Kubernetes Deployment
**Status:** Completed

*   **Objective of the Phase:** Automate the build/deployment lifecycle and host the application on a robust, highly-available containerized infrastructure.
*   **Features Implemented:**
    *   GitHub Actions CI/CD pipeline for cloud-hosted automated Docker builds.
    *   Jenkins declarative pipeline for local build interception via Ngrok webhooks.
    *   Fully functional local Kubernetes cluster setup with LoadBalancers and persistent volumes.
*   **Files Created / Modified:**
    *   *Created:* `.github/workflows/docker-publish.yml`
    *   *Created:* `Jenkinsfile`
    *   *Created:* `k8s/mongo-deployment.yaml`, `k8s/backend-config.yaml`, `k8s/backend-deployment.yaml`, `k8s/frontend-deployment.yaml`
*   **Changes Made:** Migrated the entire system off raw Docker Compose onto Native Kubernetes (K8s) manifests.
*   **Problems Addressed / Solved:** 
    *   Resolved severe Jenkins environment dependency crashes related to missing Docker Engine properties.
    *   Bypassed Windows Hyper-V driver lockouts in Minikube by forcing the `--driver=docker` flag.
*   **Key Decisions Taken:** Chose an Nginx Ingress Controller over standard NodePorts to properly route `/api` and root `/` paths autonomously.

---

## Phase 2
**Phase Name:** Microservices Architecture Reconnaissance & Planning
**Status:** Completed

*   **Objective of the Phase:** Analyze the monolithic Node.js backend and the new Flutter UI integration to formulate a comprehensive structural migration plan.
*   **Features Implemented:**
    *   Generated an enterprise structural Microservices map (`api-gateway`, `auth-service`, `user-service`, `chat-service`).
    *   Audited the new `flutter_chat_app` module for state management and Dio API interceptions.
*   **Files Created / Modified:**
    *   *Created:* `implementation_plan.md` (Microservices restructuring architecture)
*   **Changes Made:** Shifting architectural mindset; planning to replace direct REST calls dynamically through an `api-gateway` and utilize Redis Pub/Sub for cross-service events.
*   **Problems Addressed / Solved:** Identified that the new Flutter app's socket connection and API targets will break upon backend splitting, mapped out the mitigation (re-targeting to the Gateway load balancer).
*   **Key Decisions Taken:** Split logic into exactly 4 distinct Node.js services utilizing Redis as an Event Bus to prevent database coupling.

---

## Phase 3
**Phase Name:** Microservice Decomposition — Execution
**Status:** Completed

*   **Objective of the Phase:** Surgically decompose the monolithic `backend/` Node.js server into 4 independent, isolated microservices, each with its own server, Dockerfile, and domain responsibility.
*   **Features Implemented:**
    *   **Auth Service** (`services/auth-service/`) — Owns registration, login, JWT token generation, refresh, logout. Runs on port 5001.
    *   **User Service** (`services/user-service/`) — Owns user listing, search (regex + text index). Runs on port 5002.
    *   **Chat Service** (`services/chat-service/`) — Owns messages, conversations, Socket.IO WebSocket server with Redis adapter. Runs on port 5003.
    *   **API Gateway** (`services/api-gateway/`) — Reverse proxy using `http-proxy-middleware`. Routes `/api/auth` → auth, `/api/users` → user, `/api/messages` & `/api/conversations` & `/socket.io` → chat. Runs on port 5000.
*   **Files Created:**
    *   `services/auth-service/` — `server.js`, `package.json`, `Dockerfile`, `.env`, `config/db.js`, `config/metrics.js`, `models/User.js`, `controllers/authController.js`, `routes/authRoutes.js`, `middleware/authMiddleware.js`
    *   `services/user-service/` — `server.js`, `package.json`, `Dockerfile`, `.env`, `config/db.js`, `config/metrics.js`, `models/User.js`, `controllers/userController.js`, `routes/userRoutes.js`, `middleware/authMiddleware.js`
    *   `services/chat-service/` — `server.js`, `package.json`, `Dockerfile`, `.env`, `config/db.js`, `config/metrics.js`, `models/User.js`, `models/Message.js`, `models/Conversation.js`, `controllers/messageController.js`, `controllers/conversationController.js`, `routes/messageRoutes.js`, `routes/conversationRoutes.js`, `socket/socket.js`, `middleware/authMiddleware.js`
    *   `services/api-gateway/` — `server.js`, `package.json`, `Dockerfile`, `.env`, `config/metrics.js`
*   **Changes Made (Before → After):**
    *   **Before:** Single `backend/server.js` handling ALL routes, ALL models, ALL socket logic in one process.
    *   **After:** 4 isolated Node.js processes, each owning a specific domain. Gateway on port 5000 transparently proxies requests so React and Flutter clients require zero URL changes.
*   **Problems Addressed / Solved:**
    *   Refactored `socket/socket.js` from a self-initializing pattern (creating its own `express()` and `http.createServer()`) into an injectable `initSocket(server)` pattern so the chat-service server.js controls the lifecycle.
    *   Changed `messageController.js` from direct `io` import to `getIO()` lazy accessor pattern to prevent circular dependency crashes during module initialization.
*   **Key Decisions Taken:**
    *   Shared single MongoDB instance (all services access `chatApp` database) — pragmatic middle ground vs. database-per-service isolation which is overkill at this scale.
    *   Added Redis (`redis:7-alpine`) container for Socket.IO multi-pod broadcasting adapter.
    *   API Gateway uses `ws: true` flag for WebSocket upgrade proxying to ensure Socket.IO survives through the gateway layer.

---

## Phase 4
**Phase Name:** Prometheus & Grafana Monitoring Stack
**Status:** Completed

*   **Objective of the Phase:** Implement enterprise-grade observability by instrumenting all microservices with Prometheus metrics and providing real-time visual dashboards via Grafana.
*   **Features Implemented:**
    *   Integrated `prom-client` npm package into all 4 microservices.
    *   Each service exposes a `/metrics` endpoint scraped by Prometheus every 15 seconds.
    *   Pre-built Grafana dashboard with 8 panels: HTTP request rate, latency percentiles (p95), active WebSocket connections, total messages sent, login attempts, registrations, memory usage, and gateway proxy errors.
*   **Files Created:**
    *   `monitoring/prometheus/prometheus.yml` — Scrape configuration targeting all 4 services.
    *   `monitoring/grafana/provisioning/datasources/datasource.yml` — Auto-configures Prometheus as default Grafana datasource.
    *   `monitoring/grafana/provisioning/dashboards/dashboard.yml` — Auto-loads dashboard JSON from file.
    *   `monitoring/grafana/dashboards/microservices.json` — 8-panel production dashboard.
*   **Custom Prometheus Metrics Added:**
    *   `auth_login_attempts_total` (Counter, labels: success/failed/error)
    *   `auth_registrations_total` (Counter, labels: success/duplicate/error)
    *   `user_search_total` (Counter, labels: success/error)
    *   `chat_messages_sent_total` (Counter, labels: success/error)
    *   `chat_active_websocket_connections` (Gauge — live count of online users)
    *   `gateway_proxy_errors_total` (Counter, labels: target_service)
    *   `http_request_duration_seconds` (Histogram — per service)
    *   `http_requests_total` (Counter — per service)
*   **Changes Made:**
    *   Modified `docker-compose.yml` — expanded from 3 services to 9 services (mongo, redis, api-gateway, auth-service, user-service, chat-service, frontend, prometheus, grafana).
    *   All services connected via a shared `chat-network` bridge network.
*   **Problems Addressed / Solved:** Pre-provisioned Grafana datasource and dashboard to eliminate manual configuration — dashboard loads automatically on first boot.
*   **Key Decisions Taken:**
    *   Grafana runs on port `3001` (to avoid conflict with frontend on `3000`). Login: `admin` / `admin`.
    *   Prometheus retains 30 days of metrics data via `--storage.tsdb.retention.time=30d`.
    *   Used Histogram buckets optimized for API latency: `[10ms, 50ms, 100ms, 300ms, 500ms, 1s, 2s, 5s]`.

---

## Phase 5
**Phase Name:** Build & Integration Testing
**Status:** Completed — 2026-04-19

*   **Objective of the Phase:** Build all 9 Docker images end-to-end, verify every container starts healthy, and run API integration tests through the gateway.
*   **Build Results:**
    *   All 4 microservice images (`auth-service`, `user-service`, `chat-service`, `api-gateway`) built successfully using cached layers.
    *   Frontend (React/Vite → Nginx multi-stage) built and served on port `3000`.
    *   Prometheus and Grafana images pulled and started from official registries.
*   **Container Status (9/9 Running):**
    *   `chat-mongo` (mongo:7) → port 27017 ✅
    *   `chat-redis` (redis:7-alpine) → port 6379 ✅
    *   `chat-auth` → port 5001 internal ✅
    *   `chat-user` → port 5002 internal ✅
    *   `chat-chat` → port 5003 internal ✅
    *   `chat-gateway` → port 5000 ✅
    *   `chat-frontend` → port 3000→80 ✅
    *   `chat-prometheus` → port 9091→9090 ✅
    *   `chat-grafana` → port 3001→3000 ✅
*   **Health Check Results:**
    *   `GET http://localhost:5000/health` → `{"service":"api-gateway","status":"healthy","uptime":75,...}` ✅
    *   `GET http://localhost:9091/-/ready` → `"Prometheus Server is Ready."` ✅
    *   `GET http://localhost:3001/api/health` → `{"database":"ok","version":"13.0.1",...}` ✅
*   **Integration Test Results:**
    *   `POST /api/auth/register` → `201` ✅ — User created, JWT tokens returned
    *   `POST /api/auth/login` → `200` ✅ — Access + Refresh tokens returned
    *   All requests successfully routed: API Gateway → Auth Service → MongoDB
*   **Problems Addressed / Solved:**
    *   **Port Conflict** — Host port `9090` was already occupied. Remapped Prometheus host port to `9091` (`9091:9090`).
    *   **Proxy Path Rewrite Bug** — `http-proxy-middleware` v3 receives `req.url` stripped of the Express mount prefix. Fixed `pathRewrite` from `{ "^/api/auth": "/api/auth" }` to `{ "^/": "/api/auth/" }` on all proxy routes so downstream services receive the correct full paths.
    *   **Obsolete Compose Key** — Removed `version: "3.9"` from `docker-compose.yml` to eliminate Docker Compose v2 deprecation warnings on every command.
*   **Key Decisions Taken:**
    *   Microservices not exposed on host ports (only gateway port `5000` is publicly accessible) — enforces single-entry-point security pattern.
    *   Prometheus remapped to `9091` rather than terminating the existing process occupying `9090`.
*   **Extended Integration Tests (Chat Service):**
    *   `POST /api/messages/:receiverId` → `201` ✅ — Message sent, `conversationId` auto-created
    *   `GET /api/messages/:convId` → `200` ✅ — History returned (1 message)
    *   `GET /api/conversations` → `200` ✅ — 1 conversation listed for Alice
    *   `POST reply Bob → Alice` → `201` ✅ — Bidirectional messaging confirmed
    *   `PUT /api/messages/:convId/seen` → `200` ✅ — Read receipts working
    *   Socket.IO `?EIO=4&transport=polling` → `sid` handshake ✅ — WebSocket upgrade proxy verified
    *   Prometheus `/metrics` endpoint → `200` ✅ — Metrics scraping works through gateway

---

### Phase 6: Kubernetes Microservice Manifests ✅

*   **Objective:** Migrate all `k8s/production/` Kubernetes manifests from the old monolithic `backend` deployment to the new 4-service microservice architecture.
*   **Status:** ✅ Complete
*   **Files Created/Modified:**
    *   `gateway-deployment.yaml` — API Gateway (2 replicas, port 5000, service discovery via env vars)
    *   `auth-deployment.yaml` — Auth Service + HPA (2–6 pods, port 5001)
    *   `user-deployment.yaml` — User Service + HPA (2–4 pods, port 5002)
    *   `chat-deployment.yaml` — Chat Service + HPA (2–8 pods, port 5003, 256Mi–512Mi RAM)
    *   `redis-deployment.yaml` — Socket.IO multi-pod adapter (ephemeral, no persistence)
    *   `prometheus-deployment.yaml` — Self-hosted monitoring (30-day retention, 10Gi PVC)
    *   `grafana-deployment.yaml` — Dashboard visualization (NodePort 31001, auto-provisioned datasource)
    *   `configmap.yaml` — Shared production config (renamed to `chattining-config`)
    *   `secrets.yaml` — Shared secrets (renamed to `chattining-secrets`, JWT_SECRET + MONGO_URI)
    *   `ingress.yaml` — Updated routing: all `/api/*` and `/socket.io/*` → `gateway-service:5000`
*   **Files Deleted:**
    *   `backend-deployment.yaml`, `backend-service.yaml`, `backend-hpa.yaml` (old monolith)
*   **CI/CD Updated:**
    *   `.github/workflows/docker-publish.yml` rewritten with matrix strategy
    *   Builds 5 images in parallel: `chattining-gateway`, `chattining-auth`, `chattining-user`, `chattining-chat`, `chattining-frontend`
    *   Per-service scoped GHA cache
    *   Docker Scout CVE scanning on all images
*   **Monitoring Decision:** Self-hosted Prometheus + Grafana in K8s (zero recurring cost vs ~$30+/mo for managed alternatives)
*   **Validation:** All 14 manifest files (27 K8s documents) passed YAML syntax validation
*   **Note:** Full K8s dry-run requires Minikube running — syntax validated offline

---

### Phase 7: Resume Gap Implementation (Terraform, k6, Loki, Trivy) ✅

*   **Objective:** Implement all 4 missing components claimed in the resume to make every bullet point verifiable.
*   **Status:** ✅ Complete

#### Terraform Infrastructure-as-Code
*   Created `infra/` directory with 6 Terraform files
*   `main.tf` — AWS provider (ap-south-1), S3 backend config
*   `vpc.tf` — VPC (10.0.0.0/16), 2 public + 2 private subnets, NAT Gateway, multi-AZ
*   `eks.tf` — EKS cluster (K8s 1.29), managed node group (t3.medium, 2–4 nodes), IRSA
*   `ecr.tf` — 5 ECR repositories with immutable tags, scan-on-push, lifecycle cleanup
*   `variables.tf` — 9 configurable variables with defaults
*   `outputs.tf` — Cluster endpoint, kubectl command, ECR URLs

#### k6 Load Testing
*   Created `tests/load/` with 3 files
*   `http-load.js` — REST API load test: auth, users, chat endpoints, ramps to 5000 VUs
*   `websocket-load.js` — Socket.IO WebSocket connections at 5000 concurrent VUs
*   `README.md` — Installation, usage, thresholds documentation
*   Thresholds: p95 < 500ms, error rate < 1%, WS connect > 95%

#### Loki + Promtail (Centralized Logging)
*   `k8s/production/loki-deployment.yaml` — ConfigMap + PVC (5Gi) + Deployment + Service
*   `k8s/production/promtail-daemonset.yaml` — DaemonSet + RBAC (ClusterRole + ServiceAccount)
*   Updated `grafana-deployment.yaml` — Added Loki as second datasource
*   Updated `docker-compose.yml` — Added loki + promtail services for local dev
*   Created `monitoring/promtail/promtail-config.yml` — Docker log scraper

#### Trivy Security Scanner
*   Updated `.github/workflows/docker-publish.yml` — Trivy scan alongside Docker Scout
*   Updated `Jenkinsfile` — Added "Security Scan (Trivy)" stage after push
*   Scans all 5 images for Critical/High CVEs

*   **Validation:** All 16 K8s manifests (35 documents) passed YAML syntax validation
