#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# KubeChat — AWS EC2 Auto-Setup Script
# Run this on a fresh AWS EC2 t2.micro instance (Ubuntu 22.04)
#
# Usage (paste in EC2 terminal after SSH):
#   curl -sSL https://raw.githubusercontent.com/mittal122/kubechat-microservices/master/aws-setup.sh | bash
# ═══════════════════════════════════════════════════════════════

set -e

# ── Colors ──────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

print_step() { echo -e "\n${CYAN}══ $1 ══${NC}"; }
print_ok()   { echo -e "${GREEN}  ✅ $1${NC}"; }
print_warn() { echo -e "${YELLOW}  ⚠️  $1${NC}"; }
print_info() { echo -e "  ℹ️  $1"; }

# ── CONFIGURATION — already filled in for you ───────────────────
REPO_URL="https://github.com/mittal122/kubechat-microservices.git"
DEPLOY_DIR="/opt/kubechat"
MONGO_URI="mongodb+srv://mittalaws_db_user:Mittal0000@kubechat.v1nj0sh.mongodb.net/chatApp?appName=kubechat"
REDIS_URL="rediss://default:gQAAAAAAAa06AAIgcDE0YmI3ZjQ4YTA5ZDQ0NjU5YjEzMDAyZDgzOGRhOGVkZA@amusing-trout-109882.upstash.io:6379"
JWT_SECRET="2c1575d2bba5e21c5554d09a03f365e72f75fd8736626b42a6d2461d40b2fbc46eaa9ef29497818f247ca48e0c2e7a0dfdc624e501c30433fdcfebf3062ef61c"
# ────────────────────────────────────────────────────────────────

echo ""
echo "  ██╗  ██╗██╗   ██╗██████╗ ███████╗ ██████╗██╗  ██╗ █████╗ ████████╗"
echo "  ██╔═╗██║██║   ██║██╔══██╗██╔════╝██╔════╝██║  ██║██╔══██╗╚══██╔══╝"
echo "  ██╔╝ ██║██║   ██║██████╔╝█████╗  ██║     ███████║███████║   ██║   "
echo "  ██║  ██║██║   ██║██╔══██╗██╔══╝  ██║     ██╔══██║██╔══██║   ██║   "
echo "  ██║  ██║╚██████╔╝██████╔╝███████╗╚██████╗██║  ██║██║  ██║   ██║   "
echo "  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝  "
echo ""
echo "  AWS EC2 Auto-Setup Script"
echo "  ======================================================"

# ── Step 1: Update system ────────────────────────────────────────
print_step "Step 1/5: Updating system packages"
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
print_ok "System updated"

# ── Step 2: Install Docker ───────────────────────────────────────
print_step "Step 2/5: Installing Docker"
if command -v docker &> /dev/null; then
    print_ok "Docker already installed ($(docker --version))"
else
    print_info "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    print_ok "Docker installed"
fi

# Docker Compose plugin
if docker compose version &> /dev/null; then
    print_ok "Docker Compose already installed"
else
    sudo apt-get install -y docker-compose-plugin -qq
    print_ok "Docker Compose installed"
fi

# ── Step 3: Clone repository ─────────────────────────────────────
print_step "Step 3/5: Setting up project"
if [ -d "$DEPLOY_DIR" ]; then
    print_info "Project exists — pulling latest..."
    sudo git -C $DEPLOY_DIR pull origin master
else
    sudo git clone $REPO_URL $DEPLOY_DIR
fi
sudo chown -R $USER:$USER $DEPLOY_DIR
print_ok "Repository ready"

# ── Step 4: Create .env file ─────────────────────────────────────
print_step "Step 4/5: Creating environment config"
cat > $DEPLOY_DIR/.env << EOF
MONGO_URI=${MONGO_URI}
REDIS_URL=${REDIS_URL}
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production
CORS_ORIGIN=*
AUTH_SERVICE_URL=http://auth-service:5001
USER_SERVICE_URL=http://user-service:5002
CHAT_SERVICE_URL=http://chat-service:5003
EOF
print_ok ".env file created"

# ── Step 5: Start services ───────────────────────────────────────
print_step "Step 5/5: Building and starting all services"
cd $DEPLOY_DIR
sudo docker compose -f docker-compose.prod.yml up -d --build

print_info "Waiting 20 seconds for services to initialize..."
sleep 20

# Health check
if curl -sf http://localhost:5000/health > /dev/null 2>&1; then
    print_ok "API Gateway is healthy!"
else
    print_warn "Still starting up — check with: docker compose logs"
fi

# Get AWS public IP
PUBLIC_IP=$(curl -sf http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "CHECK_AWS_CONSOLE")

echo ""
echo "  ======================================================"
echo -e "  ${GREEN}✅ KubeChat is LIVE on AWS!${NC}"
echo "  ======================================================"
echo ""
echo "  Server URL:   http://${PUBLIC_IP}:5000"
echo "  Health check: http://${PUBLIC_IP}:5000/health"
echo ""
echo "  ── Flutter App Setup ──────────────────────────────────"
echo "  1. Open: flutter_chat_app/lib/config/api_config.dart"
echo "  2. Set:  _productionUrl = 'http://${PUBLIC_IP}:5000'"
echo "  3. Build APK: flutter build apk --release --dart-define=ENV=production"
echo ""
echo "  ── Useful Commands ────────────────────────────────────"
echo "  View logs:    cd /opt/kubechat && docker compose logs -f"
echo "  Restart:      cd /opt/kubechat && docker compose restart"
echo "  Stop:         cd /opt/kubechat && docker compose down"
echo "  Update code:  cd /opt/kubechat && git pull && docker compose up -d --build"
echo "  ======================================================"
