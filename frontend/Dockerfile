# ---------- Build stage ----------
FROM node:20-slim AS builder

WORKDIR /app

# 1️⃣ Copy manifests & install deps
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# 2️⃣ Copy source & build
COPY . .

# In Docker, API requests go through nginx proxy (same origin) — empty base URL
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build   # produces ./dist

# ---------- Runtime stage ----------
FROM nginx:alpine

# 3️⃣ Copy the static bundle
COPY --from=builder /app/dist /usr/share/nginx/html

# 4️⃣ Copy custom nginx config (reverse-proxy for API & Socket.IO)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 5️⃣ Expose HTTP
EXPOSE 80

# nginx already defines CMD/ENTRYPOINT
