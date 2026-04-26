# 🚪 API Gateway — Deep Dive

> **"The Smart Traffic Cop of the Chattining microservices system"**
>
> Every single request from every client — whether it is a login call, a user search, a chat message,
> or a live WebSocket connection — passes through this one Node.js process first.
> Nothing reaches a downstream service without the gateway's blessing.

---

## Table of Contents

1. [What Is an API Gateway?](#1-what-is-an-api-gateway)
2. [Where It Sits in the Architecture](#2-where-it-sits-in-the-architecture)
3. [Directory Structure & Files](#3-directory-structure--files)
4. [Core Feature: Request Routing](#4-core-feature-request-routing)
5. [Core Feature: Path Rewriting](#5-core-feature-path-rewriting)
6. [Core Feature: WebSocket Proxying](#6-core-feature-websocket-proxying)
7. [Core Feature: Error Handling & 502 Responses](#7-core-feature-error-handling--502-responses)
8. [Core Feature: CORS Management](#8-core-feature-cors-management)
9. [Core Feature: Prometheus Metrics](#9-core-feature-prometheus-metrics)
10. [Core Feature: Health Check](#10-core-feature-health-check)
11. [Kubernetes Deployment Details](#11-kubernetes-deployment-details)
12. [Why an API Gateway? Problems It Solves](#12-why-an-api-gateway-problems-it-solves)
13. [Business Value, Scalability & Security](#13-business-value-scalability--security)
14. [Interview Talking Points](#14-interview-talking-points)

---

## 1. What Is an API Gateway?

### The Analogy

Imagine a large hotel.  Every guest who arrives walks through **one main entrance** — the reception lobby.  The lobby receptionist directs you:

- "You want the restaurant? Third floor, turn left."
- "You want the gym? Basement level."
- "You want Wi-Fi support? Room 101, IT helpdesk."

No guest wanders directly into the kitchen or the laundry room.  The lobby is the **single entry point** that knows where everything is and routes people to the right place.

The **API Gateway** is that lobby for our microservices system.  Every client request (from the Flutter app or the React web app) arrives at port **5000** on the gateway, which then forwards it to whichever backend service actually owns that request.

### The System-Design Term

In distributed systems this pattern is called the **API Gateway pattern**.  It is a reverse proxy that:

- provides **a single, stable URL** to clients (clients never need to know internal service addresses)
- **routes** each request to the correct downstream microservice
- **cross-cuts** concerns like CORS, metrics, error handling, and logging in one place so individual services do not have to repeat them

---

## 2. Where It Sits in the Architecture

```
Internet
    │
    ▼
┌──────────────────────────────────────┐
│  NGINX Ingress (TLS termination)     │
│  Sticky Sessions · cert-manager      │
└─────────────┬────────────────────────┘
              │ /api/*  and  /socket.io/*
              ▼
┌─────────────────────────────────────────┐
│  API Gateway  ·  Port 5000              │ ◄── YOU ARE HERE
│  services/api-gateway/server.js         │
│  2 replicas · RollingUpdate strategy    │
└──────┬────────────┬────────────┬────────┘
       │            │            │
       ▼            ▼            ▼
  Auth Service  User Service  Chat Service
  Port 5001     Port 5002     Port 5003
```

**Key observations:**

| Layer | What it does |
|---|---|
| NGINX Ingress | Terminates TLS, enforces sticky sessions, forwards `/api/*` and `/socket.io/*` to the gateway |
| **API Gateway** | **Inspects the path and proxies to the right backend service** |
| Auth / User / Chat | Each service handles only its own domain logic; they are never exposed directly to clients |

The gateway is the *only* pod in the cluster that the ingress talks to for API traffic.
The three backend services live entirely inside the Kubernetes cluster network and are not reachable from outside.

---

## 3. Directory Structure & Files

```
services/api-gateway/
├── server.js          ← Entry point: all routing logic lives here
├── config/
│   └── metrics.js     ← Prometheus counters, histograms, middleware
├── package.json       ← Dependencies: express, http-proxy-middleware, prom-client, cors, dotenv
├── .env               ← Local development overrides (PORT, service URLs)
└── Dockerfile         ← Minimal node:20-alpine image, port 5000
```

### `package.json` — Dependency Map

```json
// services/api-gateway/package.json
{
  "dependencies": {
    "cors": "^2.8.6",                    // CORS header management
    "dotenv": "^17.3.1",                 // Load .env into process.env
    "express": "^4.22.1",               // HTTP server framework
    "http-proxy-middleware": "^3.0.0",  // Core reverse-proxy engine
    "prom-client": "^15.1.0"            // Prometheus metrics
  }
}
```

Five focused dependencies.  No authentication logic, no database drivers, no business logic.
The gateway deliberately stays thin — it only proxies.

---

## 4. Core Feature: Request Routing

### The Problem Without a Gateway

Without a gateway, a Flutter client would need to know *four* different URLs:

```
http://auth-service:5001/api/auth/login
http://user-service:5002/api/users/search
http://chat-service:5003/api/messages/...
http://chat-service:5003/socket.io/...
```

Those are internal Kubernetes DNS names that are meaningless from outside the cluster.
The client would also have to handle CORS from four different origins and implement retry logic for four services independently.

### The Solution: Route Table in `server.js`

```javascript
// services/api-gateway/server.js  (lines 51-115)

// ── Proxy Routes ──

// Auth Service: /api/auth/*
app.use("/api/auth", createProxyMiddleware({
  target: AUTH_SERVICE_URL,   // http://auth-service:5001
  changeOrigin: true,
  pathRewrite: { "^/": "/api/auth/" },
  on: { error: (err, req, res) => {
    console.error("Auth proxy error:", err.message);
    res.status(502).json({ message: "Auth service unavailable" });
  }},
}));

// User Service: /api/users/*
app.use("/api/users", createProxyMiddleware({
  target: USER_SERVICE_URL,   // http://user-service:5002
  changeOrigin: true,
  pathRewrite: { "^/": "/api/users/" },
  on: { error: (err, req, res) => {
    console.error("User proxy error:", err.message);
    res.status(502).json({ message: "User service unavailable" });
  }},
}));

// Chat Service: /api/messages/*
app.use("/api/messages", createProxyMiddleware({
  target: CHAT_SERVICE_URL,   // http://chat-service:5003
  changeOrigin: true,
  pathRewrite: { "^/": "/api/messages/" },
  on: { error: (err, req, res) => {
    console.error("Chat proxy error:", err.message);
    res.status(502).json({ message: "Chat service unavailable" });
  }},
}));

// Chat Service: /api/conversations/*
app.use("/api/conversations", createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { "^/": "/api/conversations/" },
  on: { error: (err, req, res) => {
    console.error("Chat proxy error:", err.message);
    res.status(502).json({ message: "Chat service unavailable" });
  }},
}));
```

### Routing Table Summary

| Client sends | Gateway strips prefix | Forwards to | Upstream sees |
|---|---|---|---|
| `POST /api/auth/login` | `/api/auth` | `auth-service:5001` | `POST /api/auth/login` |
| `GET /api/users/search` | `/api/users` | `user-service:5002` | `GET /api/users/search` |
| `POST /api/messages/:id` | `/api/messages` | `chat-service:5003` | `POST /api/messages/:id` |
| `GET /api/conversations` | `/api/conversations` | `chat-service:5003` | `GET /api/conversations` |
| `GET /socket.io/...` | `/socket.io` | `chat-service:5003` | `GET /socket.io/...` |

The client only ever knows one address: the gateway on port **5000**.

---

## 5. Core Feature: Path Rewriting

This is one of the more subtle but important details of the implementation.

### The Problem

When Express mounts a proxy at `/api/auth`, it **strips that prefix** before passing the request to middleware.  So `POST /api/auth/login` becomes `POST /login` by the time `http-proxy-middleware` sees it.  If the gateway forwarded `/login` to the auth service, the auth service's router would not find a matching handler (because it listens on `/api/auth/login`).

### The Solution

```javascript
// services/api-gateway/server.js  (line 54)
pathRewrite: { "^/": "/api/auth/" },
```

This regex replaces the leading `/` (which is what remains after Express strips the mount path) with `/api/auth/`, so the auth service receives the full original path it expects.

**Step-by-step trace for `POST /api/auth/login`:**

```
1. Client sends:          POST /api/auth/login
2. Express mount strips:  POST /login          (because mounted at /api/auth)
3. pathRewrite applies:   POST /api/auth/login (regex "^/" → "/api/auth/")
4. Upstream receives:     POST /api/auth/login  ✅
```

The same pattern is applied consistently across all four proxy routes.

---

## 6. Core Feature: WebSocket Proxying

Real-time chat requires a persistent WebSocket connection.  This is the most technically complex part of the gateway.

### Why WebSockets Are Different

A normal HTTP request is:  client → server → response → connection closes.

A WebSocket connection is:  client → server → **connection stays open indefinitely**, allowing bidirectional push messages.

Proxying WebSockets requires handling the HTTP **Upgrade handshake** — a special HTTP request that asks the server to switch protocols.

### The Two-Layer Implementation

```javascript
// services/api-gateway/server.js  (lines 101-127)

// Layer 1: HTTP-level Socket.IO requests (polling fallback)
const socketProxy = createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  ws: true,                           // enable WebSocket proxying
  pathRewrite: { "^/": "/socket.io/" },
  on: {
    error: (err, req, res) => {
      console.error("WebSocket proxy error:", err.message);
    },
  },
});
app.use("/socket.io", socketProxy);

// Layer 2: Raw TCP upgrade — CRITICAL for WebSocket handshake
// express() alone cannot handle the Upgrade event.
// http.createServer() wraps it, and we forward the 'upgrade' event manually.
const server = http.createServer(app);
server.on("upgrade", socketProxy.upgrade);   // line 127
```

**Why `http.createServer()` instead of `app.listen()`?**

`app.listen()` is a convenience wrapper around `http.createServer()` that does *not* expose the underlying server object.  Without the server object you cannot attach an `upgrade` event listener.  The gateway explicitly creates the server to gain access to this event.

**Flow for a WebSocket connection:**

```
1. Flutter/React sends HTTP GET /socket.io/?transport=polling   (initial Socket.IO handshake)
2. Gateway Express layer matches /socket.io → socketProxy → Chat Service:5003
3. Client upgrades: sends HTTP Upgrade request
4. server 'upgrade' event fires
5. socketProxy.upgrade() intercepts and forwards the raw TCP socket to Chat Service
6. Full duplex WebSocket tunnel is now open: Client ↔ Gateway ↔ Chat Service
```

**pathRewrite for WebSocket:**

```javascript
pathRewrite: { "^/": "/socket.io/" }
```

Same reason as HTTP routes: Express strips the `/socket.io` mount prefix, and this rewrite restores it so the chat service recognizes the path.

---

## 7. Core Feature: Error Handling & 502 Responses

Each proxy route has a structured error handler:

```javascript
// services/api-gateway/server.js  (lines 55-60, repeated per route)
on: {
  error: (err, req, res) => {
    console.error("Auth proxy error:", err.message);
    res.status(502).json({ message: "Auth service unavailable" });
  },
},
```

### What HTTP 502 Means

**502 Bad Gateway** is the correct HTTP status code when a proxy cannot reach its upstream server.  It tells the client: "I am alive and I received your request, but the service I need to talk to is down."

This is important because:

- **502** = "gateway is healthy, downstream is broken" — client knows to retry later or show a meaningful error
- **500** = "something inside me crashed" — would be misleading here
- **404** = "I don't know this route" — also misleading

### Fallback for Unknown Routes

```javascript
// services/api-gateway/server.js  (lines 117-120)
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});
```

Any request that does not match `/api/auth`, `/api/users`, `/api/messages`, `/api/conversations`, or `/socket.io` gets a clean 404 JSON response.  This prevents confusing HTML error pages from Express leaking through.

---

## 8. Core Feature: CORS Management

```javascript
// services/api-gateway/server.js  (lines 17-23)
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));
```

### Why CORS Lives at the Gateway

**Cross-Origin Resource Sharing (CORS)** is a browser security mechanism.  When a React app at `http://localhost:3000` calls an API at `http://localhost:5000`, the browser first sends a **preflight OPTIONS request** to check whether the API allows requests from that origin.

Without CORS headers the browser blocks the request entirely.

**The gateway handles CORS centrally.**  This means:

- Auth Service, User Service, and Chat Service do **not** need to configure CORS themselves
- There is exactly one place to update if the allowed origin changes (e.g., from `*` to `https://chat.yourdomain.com` in production)
- The `CORS_ORIGIN` environment variable makes this configurable per-environment without code changes

---

## 9. Core Feature: Prometheus Metrics

The gateway exposes two custom metrics that let Prometheus (and therefore Grafana) observe its behaviour.

### The Metrics Module

```javascript
// services/api-gateway/config/metrics.js

const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register }); // CPU, memory, event loop, GC

// ── Custom Metric 1: Request Duration (Histogram) ──
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],  // latency buckets
  registers: [register],
});

// ── Custom Metric 2: Request Counter ──
const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// ── Custom Metric 3: Proxy Error Counter ──
const gatewayProxyErrors = new client.Counter({
  name: "gateway_proxy_errors_total",
  help: "Total number of proxy errors in the gateway",
  labelNames: ["target_service"],
  registers: [register],
});
```

### The Metrics Middleware

```javascript
// services/api-gateway/config/metrics.js  (lines 28-44)
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {                             // fires after response is sent
    const duration = (Date.now() - start) / 1000;     // convert ms → seconds
    const route = req.originalUrl || req.path;
    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );
    httpRequestTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
  });
  next();
};
```

This middleware wraps **every** request.  It starts a timer, and once the response is complete it records both the total count and the latency into the Prometheus registry.

### The Metrics Endpoint

```javascript
// services/api-gateway/config/metrics.js  (lines 46-49)
const metricsEndpoint = async (req, res) => {
  res.set("Content-Type", register.contentType);  // text/plain; version=0.0.4
  res.end(await register.metrics());              // serialises all metrics in Prometheus format
};
```

```javascript
// services/api-gateway/server.js  (line 44)
app.get("/metrics", metricsEndpoint);
```

Prometheus scrapes `GET /metrics` on a schedule (every 15 seconds by default) and stores the time-series data.  Grafana then queries Prometheus to build dashboards.

**Example scraped output:**

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",route="/api/auth/login",status_code="200"} 142
http_requests_total{method="GET",route="/api/users/search",status_code="200"} 89
http_requests_total{method="POST",route="/api/messages/:receiverId",status_code="201"} 56

# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="POST",route="/api/auth/login",status_code="200",le="0.1"} 130
http_request_duration_seconds_bucket{method="POST",route="/api/auth/login",status_code="200",le="0.3"} 140
```

---

## 10. Core Feature: Health Check

```javascript
// services/api-gateway/server.js  (lines 28-41)
app.get("/health", (req, res) => {
  res.status(200).json({
    service: "api-gateway",
    status: "healthy",
    uptime: Math.floor(process.uptime()),   // seconds since Node process started
    timestamp: new Date().toISOString(),
    downstream: {
      auth: AUTH_SERVICE_URL,
      user: USER_SERVICE_URL,
      chat: CHAT_SERVICE_URL,
    },
  });
});
```

**Example response:**
```json
{
  "service": "api-gateway",
  "status": "healthy",
  "uptime": 3742,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "downstream": {
    "auth":  "http://auth-service:5001",
    "user":  "http://user-service:5002",
    "chat":  "http://chat-service:5003"
  }
}
```

**Why this matters in Kubernetes:**

```yaml
# k8s/production/gateway-deployment.yaml  (lines 61-82)
startupProbe:
  httpGet:
    path: /health
    port: 5000
  failureThreshold: 10
  periodSeconds: 5

readinessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10

livenessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 10
  periodSeconds: 20
```

Kubernetes uses these three probes to decide:
- **startupProbe**: has the container finished starting up? (do not kill it yet)
- **readinessProbe**: is the pod ready to receive traffic? (if not, remove it from load-balancer rotation)
- **livenessProbe**: is the pod still alive? (if not, restart it)

All three call `/health` on the gateway — a fast, cheap check that does not hit any database.

---

## 11. Kubernetes Deployment Details

```yaml
# k8s/production/gateway-deployment.yaml
spec:
  replicas: 2                         # Always 2 pods for high availability
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0               # Never take a pod down before the new one is ready
      maxSurge: 1                     # Spin up 1 extra pod during a deploy
```

**`maxUnavailable: 0`** is a zero-downtime deployment guarantee.  During a release, Kubernetes starts one new gateway pod, waits for its readiness probe to pass, *then* removes the old pod.  At no point are there fewer than 2 healthy pods serving traffic.

**Why no HPA (Horizontal Pod Autoscaler) on the gateway?**

The gateway is a stateless, CPU-light reverse proxy.  It does almost no computation — it just copies bytes between connections.  2 replicas handle the traffic easily and scaling it up would not help because the bottleneck is always in the downstream services, not the gateway.  The comment in `ARCHITECTURE.md` says: *"2 replicas (no HPA — lightweight reverse proxy), Resources: 128Mi–256Mi RAM"*.

**Resource requests/limits:**

```yaml
resources:
  requests:
    cpu: 100m        # 0.1 CPU cores guaranteed
    memory: 128Mi    # 128 MB RAM guaranteed
  limits:
    cpu: 250m        # 0.25 CPU cores maximum
    memory: 256Mi    # 256 MB RAM maximum
```

Compare this to the chat service (256Mi–512Mi RAM) which holds thousands of long-lived WebSocket connections.

---

## 12. Why an API Gateway? Problems It Solves

### Problem 1: Client Complexity

**Without gateway:** A mobile app must hardcode 3–4 internal service URLs, maintain separate retry logic for each, and handle CORS from multiple origins.

**With gateway:** The app knows exactly one URL.  All retry, fallback, and CORS logic lives in one Node.js file.

### Problem 2: Service Discovery Leakage

**Without gateway:** When you change `auth-service` to run on port 5010 instead of 5001, every client in the field needs a forced update.

**With gateway:** Clients never know internal ports.  You change the `AUTH_SERVICE_URL` environment variable in one place; clients are unaffected.

```javascript
// services/api-gateway/server.js  (lines 12-15)
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://auth-service:5001";
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://user-service:5002";
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || "http://chat-service:5003";
```

### Problem 3: Cross-Cutting Concerns Duplication

**Without gateway:** CORS configuration must be added to Auth Service, User Service, and Chat Service separately.  Prometheus metrics must be implemented in three places.  Any change to CORS policy requires three deployments.

**With gateway:** CORS and metrics are implemented once.  A policy change is one deployment to one service.

### Problem 4: Protocol Translation

**Without gateway:** The NGINX ingress does not natively know how to proxy Socket.IO's WebSocket upgrade to an internal Kubernetes service while also doing pathRewrite.

**With gateway:** The gateway handles the WebSocket upgrade event (`server.on("upgrade", socketProxy.upgrade)`) and routes it to the correct backend pod automatically.

### Problem 5: Blast Radius Isolation

**Without gateway:** If the auth service becomes temporarily overloaded and starts returning 500s, the client sees raw unstructured error responses.

**With gateway:** The `on.error` handler catches proxy failures and returns a clean, structured `502 { "message": "Auth service unavailable" }`.  The client always gets a predictable JSON response regardless of what the downstream service does.

---

## 13. Business Value, Scalability & Security

### Business Value

| Value | How the gateway delivers it |
|---|---|
| **Faster feature development** | Backend teams add a new service and a new proxy rule in the gateway; frontend teams change nothing |
| **Independent deployments** | Auth Service can be redeployed without any client-facing change |
| **Observability** | One place to see all traffic metrics — request rate, latency, error rate — without instrumenting each service separately |

### Scalability

The gateway itself is **horizontally scalable** because it is completely stateless — it holds no session data, no in-memory state, and no database connections.  You can run 2 replicas, 5 replicas, or 50 replicas and they all behave identically.

The fact that the gateway is *not* the bottleneck is by design.  It deliberately does almost nothing besides proxy bytes.  Compute-intensive work happens in the downstream services where you can scale them independently (Auth HPA: 2–6 pods, Chat HPA: 2–8 pods).

### Security

| Security property | Implementation |
|---|---|
| **Services are not directly reachable** | Auth/User/Chat services have no Ingress rules pointing to them; only the gateway's Kubernetes Service is exposed |
| **CORS policy is enforced uniformly** | `CORS_ORIGIN` env var controls which origins are allowed; one config change affects all routes |
| **No secrets in gateway** | The gateway holds no JWT signing keys, no DB passwords — it only knows internal service URLs |
| **TLS termination upstream** | NGINX Ingress handles TLS before traffic even reaches the gateway; the gateway operates inside the cluster on plain HTTP |

### Development Workflow

During local development with Docker Compose, the gateway is the equivalent of the production Kubernetes setup:

```yaml
# docker-compose.yml — gateway service
gateway:
  build: ./services/api-gateway
  ports:
    - "5000:5000"
  environment:
    AUTH_SERVICE_URL: http://auth:5001
    USER_SERVICE_URL: http://user:5002
    CHAT_SERVICE_URL: http://chat:5003
```

A developer runs `docker compose up` and their frontend can immediately talk to `http://localhost:5000` — the exact same URL structure that production uses.  No code change is required when moving from local to production.

---

## 14. Interview Talking Points

Use these when you explain the project in interviews:

### "What is the API Gateway and why did you use it?"

> "The API Gateway is the single entry point for all client traffic in our microservices system. Instead of clients needing to know about three different backend services on different internal ports, they talk to one URL — the gateway on port 5000. The gateway then routes each request to the right service based on the URL path. This is a standard pattern called the API Gateway pattern. In our case I implemented it as a Node.js service using `express` and `http-proxy-middleware`, which gives us request routing, WebSocket proxying for real-time chat, centralised CORS configuration, Prometheus metrics, and structured error handling — all in one 135-line file."

### "How does real-time chat work through the gateway?"

> "Socket.IO uses WebSockets which require a special HTTP Upgrade handshake. Express alone cannot handle this because it doesn't expose the underlying TCP server. So I created the HTTP server explicitly with `http.createServer(app)`, then attached a listener for the `upgrade` event that forwards the raw WebSocket connection to the chat service: `server.on('upgrade', socketProxy.upgrade)`. There is also a path rewrite — Express strips the `/socket.io` mount prefix, so the rewrite rule adds it back so the chat service recognises the path."

### "What happens when a downstream service goes down?"

> "Each proxy route has an `on.error` handler. If the gateway cannot reach the auth service, for example, it catches the TCP connection error and returns HTTP 502 with a JSON body `{ message: 'Auth service unavailable' }`. This is important because 502 correctly communicates 'the gateway is healthy but the upstream is broken', which lets the client decide whether to retry or show an error message. The gateway never exposes raw Node.js stack traces to clients."

### "How do you monitor the gateway?"

> "We use `prom-client` to expose three Prometheus metrics at `GET /metrics`: `http_requests_total` (a counter labelled by method, route, and status code), `http_request_duration_seconds` (a histogram for latency percentiles), and `gateway_proxy_errors_total` (a counter for failed proxies). A middleware wraps every request, starts a timer, and records both metrics when the response finishes. Prometheus scrapes this endpoint every 15 seconds and Grafana visualises it."

### "Why doesn't the gateway have a horizontal pod autoscaler?"

> "The gateway is a stateless, CPU-light reverse proxy. It doesn't do computation — it just copies bytes. Two replicas are more than sufficient. The bottleneck is always in the downstream services where the real work happens. We run HPA on those: 2–6 pods on Auth, 2–8 pods on Chat. Scaling the gateway would not help throughput."
