# ── Build stage: compile React/Vite application ──
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies (separate layer for Docker cache efficiency)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY . .

# In Docker, API requests go through nginx proxy (same origin) — empty base URL
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build   # produces ./dist

# ── Runtime stage: hardened nginx ──
FROM nginx:1.27-alpine

# Security: remove the default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy the static bundle from build stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy production nginx config (reverse-proxy for API & Socket.IO, gzip, security headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Security: ensure nginx can run as non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

# Health check for container orchestrators
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
  CMD wget -qO- http://localhost:80/ || exit 1

# Expose HTTP
EXPOSE 80

# nginx already defines CMD/ENTRYPOINT
