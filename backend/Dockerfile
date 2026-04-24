# ── Build stage: install production dependencies in isolation ──
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage: minimal attack surface ──
FROM node:20-slim
WORKDIR /app

# Security: create and use a non-root user (CIS Docker Benchmark 4.1)
RUN groupadd -r appuser && useradd -r -g appuser -s /bin/false appuser

# Copy only production node_modules from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Remove files that should not exist in the production image
RUN rm -rf tests/ .env .git .dockerignore .gitignore

# Set ownership so the non-root user can read the app files
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Health check for container orchestrators (Docker Compose, ECS, K8s)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "const http = require('http'); http.get('http://localhost:5000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Expose the listening port
EXPOSE 5000

# Startup command
CMD ["node", "server.js"]
