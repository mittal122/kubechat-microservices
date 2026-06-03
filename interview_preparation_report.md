# Chattining Application: Interview Preparation & Deep Dive Report

This document is a comprehensive guide to the architecture, DevOps practices, CI/CD pipelines, feature implementation, and infrastructure of the "Chattining" application. It is designed to provide you with all the context needed for your interview.

---

## 1. Executive Summary

**Chattining** is a scalable, real-time chat application built using a microservices architecture. It supports multiple clients (React web app and Flutter desktop/mobile app) communicating over REST and WebSockets. The backend is orchestrated via Kubernetes (EKS) and powered by Node.js, MongoDB, and Redis. The project heavily incorporates modern DevOps practices, including Infrastructure as Code (Terraform), robust CI/CD pipelines (GitHub Actions & Jenkins), containerization (Docker), and full observability (Prometheus & Grafana).

---

## 2. Complete Application Architecture

The system is broken down into distributed microservices to ensure scalability and fault tolerance. 

### Architecture Flow:
1. **Clients**: 
   - A React Web App (Vite + Nginx)
   - A Flutter App (Windows/Mobile)
2. **Ingress Layer (Kubernetes)**: 
   - An **NGINX Ingress Controller** serves as the single entry point. It manages TLS termination (via cert-manager) and ensures WebSocket upgrade compatibility using sticky sessions.
3. **API Gateway Layer**: 
   - Port 5000: An Express-based **API Gateway** using `http-proxy-middleware`. It routes requests to the correct internal microservice. Crucially, it handles HTTP to WebSocket upgrades.
4. **Microservices** (Internal routing only):
   - **Auth Service** (Port 5001): Handles Registration, Login, JWT access tokens (15-min life), and Refresh tokens (7-day life). Security includes bcrypt hashing and rate-limiting.
   - **User Service** (Port 5002): Handles user searching and listing using MongoDB native `$text` indexing and pagination for scalability.
   - **Chat Service** (Port 5003): The heaviest service. It handles REST APIs for chat history and real-time Socket.IO connections. 
5. **Data Layer**:
   - **MongoDB**: The primary database.
   - **Redis**: Used as a Socket.IO Adapter (`@socket.io/redis-adapter`) to enable WebSocket event broadcasting across multiple chat-service pods via pub/sub.
6. **Monitoring Stack**:
   - **Prometheus**: Scrapes `/metrics` from the API Gateway and microservices.
   - **Grafana**: Visualizes the metrics (Request rate, Latency, Active WebSockets, Memory usage) via 8-panel dashboards.

---

## 3. DevOps Concepts Applied

This project is a masterclass in modern DevOps methodologies:

1. **Microservices Isolation**: Decoupled services mean the `chat-service` can scale independently to 8 pods during high traffic without dragging down the `auth-service`.
2. **Infrastructure as Code (IaC)**: Terraform is used to provision the underlying AWS EKS network and clusters predictably.
3. **Containerization & Orchestration**: Dockerizes every component. Kubernetes manages deployment, healing, scaling, and networking.
4. **Horizontal Pod Autoscaling (HPA)**: Kubernetes automatically adjusts the number of pods based on CPU (65% threshold) and Memory (75% threshold) metrics.
5. **Zero-Downtime Deployments**: K8s rolling updates ensure `maxUnavailable: 0` and `maxSurge: 1`. A pod is only terminated when its replacement is healthy.
6. **Observability**: Prometheus pulls metrics dynamically, giving deep insight into system health, allowing proactive scaling and debugging rather than reactive troubleshooting.
7. **Security Shifting-Left**: Docker Scout runs in the CI pipeline to catch critical CVEs before deployment. Non-root containers are used everywhere to comply with CIS benchmarks.

---

## 4. CI/CD Pipeline Flow

We have built a two-tier CI/CD architecture (Local Jenkins + Cloud GitHub Actions).

### The Cloud Pipeline (GitHub Actions - `.github/workflows/deploy.yml`):
When code is pushed to the `main` branch, the following automated sequence occurs:
1. **Stage 1 - Test**: `npm test` runs in parallel for Auth, User, and Chat services.
2. **Stage 2 - Build & Push (Matrix Strategy)**:
   - A build matrix spins up 5 parallel workers to build the Docker images for Gateway, Auth, User, Chat, and Frontend simultaneously.
   - Images are scanned via **Docker Scout** for vulnerabilities.
   - Images are tagged with the specific Git Commit SHA (for perfect rollbacks) and pushed to both **AWS ECR** and **Docker Hub**.
3. **Stage 3 - Deploy to AWS EKS**:
   - The runner configures AWS credentials and connects to the EKS cluster.
   - It runs a script to find and replace the `latest` image tag with the new `Git SHA` inside the Kubernetes manifests (`deployment.yaml`).
   - `kubectl apply` updates the cluster, and `kubectl rollout status` waits until all new pods are confirmed healthy before marking the pipeline green.

---

## 5. Infrastructure & AWS Deployment (Terraform)

Instead of manually clicking through the AWS Console, the infrastructure is declared via **Terraform** (`infra/` directory).

### Terraform Script Breakdown:
- **`main.tf`**: Sets up the AWS provider, version constraints (Terraform >= 1.7.0), and standardizes tagging across all resources. It can connect to an S3 backend for remote state storage, ensuring multiple developers don't overwrite each other.
- **`vpc.tf`**: Creates a robust, secure Network. 
  - Provisions 2 Public Subnets (for NAT Gateway and Load Balancers).
  - Provisions 2 Private Subnets (where the EKS Worker Nodes and DBs live, hidden from the public internet).
  - Applies specific Kubernetes tags (`kubernetes.io/role/elb`) so the AWS Load Balancer controller knows where to provision external IPs.
- **`eks.tf`**: Provisions the Managed Kubernetes Cluster.
  - Deploys the control plane.
  - Provisions a managed Node Group (autoscaling between 2 to 4 `t3.medium` instances).
  - Enables IAM Roles for Service Accounts (IRSA) via OIDC, giving individual Pods secure access to AWS services without hardcoding credentials.

*Note: For a completely free tier deployment without EKS, an alternative setup using Docker Compose on a single `t2.micro` EC2 instance is provided via `AWS_DEPLOY.md`.*

---

## 6. Deep Dive: The Message Status Feature 

### The Goal: 
Provide a "WhatsApp-style" read receipt system (Sent → Delivered → Seen).

### How It Was Implemented:
1. **Data Schema Migration**: We replaced a simple boolean field (`isSeen: true/false`) with a Mongoose ENUM string field `status: ['sent', 'delivered', 'seen']`. 
2. **"Delivered" Optimization**: 
   - When Alice calls `/api/messages`, the Chat backend checks the in-memory `userSocketMap` (or Redis) to see if Bob is currently online.
   - If Bob is online, the message is saved immediately as `"delivered"` directly to the DB, and emitted live via sockets. This saves a database write, skipping the `"sent"` state.
3. **Auto-Delivery Sync**: 
   - When a user logs in (Socket `connection` event), the server queries the database for all messages marked as `"sent"` targeting this user.
   - It runs a bulk-update to change them to `"delivered"` and fires a `messagesDelivered` WebSocket event to the original senders.
4. **"Seen" Read Receipts**:
   - Opening a conversation calls `PUT /api/messages/:convId/seen`.
   - The server bulk-updates the status to `"seen"` and emits a `messagesSeen` event back to the sender, updating the UI tick to a double-violet tick.

### Why We Did It This Way (Vs. Alternatives):
- **Why an Enum over Booleans?** If we used `isDelivered: boolean` and `isSeen: boolean`, we risk database inconsistency (e.g., a message being `isSeen: true` but `isDelivered: false`, which is logically impossible). An ENUM enforces a strict, single state.
- **Why REST for "Seen" instead of pure WebSockets?** By using a REST endpoint (`PUT /seen`), we utilize HTTP semantics for database mutation, which is inherently easier to load-balance, cache, and secure via the API Gateway. The REST controller then triggers the WebSocket event (via Redis pub/sub) to alert the client, separating the "source of truth" (DB) from the "real-time notification" (Socket).
- **Why not poll for status?** Polling the database every few seconds to check if a message was read would destroy database performance and increase latency. The event-driven Socket.IO push approach ensures O(1) instantaneous updates with minimal network overhead.
