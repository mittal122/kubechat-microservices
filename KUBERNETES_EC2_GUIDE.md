# ☸️ KubeChat Kubernetes (K8s) Deployment Guide on AWS EC2

Deploying to Kubernetes is the ultimate step for scalability. Since managed Kubernetes (AWS EKS) is expensive (~$70/month just for the control plane), we will use **K3s**, a lightweight, production-ready Kubernetes distribution that runs perfectly on a single EC2 instance.

## Phase 1: The Architecture Shift
When moving to Kubernetes, the workflow changes:
- **Before (Docker Compose):** EC2 builds images from source code directly.
- **Now (Kubernetes):** Kubernetes expects images to be pre-built and hosted in a registry. **You WILL need to use Docker Hub now.**

---

## Phase 2: Push Images to Docker Hub (Do this on your Local PC)

1. **Login to Docker Hub**
   ```bash
   docker login
   ```

2. **Build and Tag your Images**
   *(Replace `yourdockerhubusername` with your actual username)*
   ```bash
   # Build Auth Service
   docker build -t yourdockerhubusername/kubechat-auth:latest ./services/auth-service
   
   # Build User Service
   docker build -t yourdockerhubusername/kubechat-user:latest ./services/user-service
   
   # Build Chat Service
   docker build -t yourdockerhubusername/kubechat-chat:latest ./services/chat-service
   
   # Build API Gateway
   docker build -t yourdockerhubusername/kubechat-gateway:latest ./services/api-gateway
   ```

3. **Push Images to Docker Hub**
   ```bash
   docker push yourdockerhubusername/kubechat-auth:latest
   docker push yourdockerhubusername/kubechat-user:latest
   docker push yourdockerhubusername/kubechat-chat:latest
   docker push yourdockerhubusername/kubechat-gateway:latest
   ```

---

## Phase 3: Setup Kubernetes (K3s) on AWS EC2

SSH into your EC2 instance and run these commands to install K3s.

1. **Install K3s:**
   ```bash
   curl -sfL https://get.k3s.io | sh -
   ```

2. **Verify Installation:**
   ```bash
   sudo k3s kubectl get nodes
   ```
   *You should see your EC2 instance listed as `Ready`.*

3. **Allow your non-root user to use kubectl:**
   ```bash
   mkdir -p ~/.kube
   sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
   sudo chown $USER:$USER ~/.kube/config
   export KUBECONFIG=~/.kube/config
   echo "export KUBECONFIG=~/.kube/config" >> ~/.bashrc
   ```

---

## Phase 4: Create Kubernetes Manifests

You will need to create `.yaml` files that tell Kubernetes how to run your apps. We will create a new folder on your EC2 for this:

```bash
mkdir -p /opt/kubechat/k8s
cd /opt/kubechat/k8s
```

*(I, Antigravity, will generate these exact Kubernetes YAML files for you in the next step. They will include Deployments, Services, and Secrets).*

---

## Phase 5: Deploying to the Cluster

Once the YAML files are created, you will deploy everything to Kubernetes using:

```bash
# 1. Apply Secrets (Environment Variables)
kubectl apply -f secrets.yaml

# 2. Apply Microservices
kubectl apply -f auth-deployment.yaml
kubectl apply -f user-deployment.yaml
kubectl apply -f chat-deployment.yaml
kubectl apply -f gateway-deployment.yaml

# 3. Check Status
kubectl get pods
kubectl get services
```

---

## Next Steps
Are you ready to proceed? If so, your next tasks are:
1. Create a Docker Hub account (if you don't have one).
2. Run the commands in **Phase 2** on your computer to push the images.
3. Let me know what your Docker Hub username is, and I will write the exact Kubernetes YAML files for Phase 4!
