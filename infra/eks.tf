# ─────────────────────────────────────────────────────────────
# EKS Cluster — Managed Kubernetes on AWS
# ─────────────────────────────────────────────────────────────
# Features:
#   - Managed control plane (AWS handles master nodes)
#   - Managed node group with autoscaling (2–4 t3.medium)
#   - OIDC provider for IAM Roles for Service Accounts (IRSA)
#   - CoreDNS, kube-proxy, vpc-cni addons managed
#   - Private API endpoint (worker nodes in private subnets)
# ─────────────────────────────────────────────────────────────

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.8"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  # ── Network ──
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # ── Cluster Access ──
  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  # ── OIDC Provider ──
  # Enables IAM Roles for Service Accounts (IRSA)
  # Required for: ALB Ingress Controller, External Secrets, etc.
  enable_irsa = true

  # ── EKS Managed Addons ──
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
  }

  # ── Worker Nodes ──
  eks_managed_node_groups = {
    chattining_nodes = {
      name = "chattining-workers"

      instance_types = [var.node_instance_type]
      capacity_type  = "ON_DEMAND"

      min_size     = var.node_min_size
      max_size     = var.node_max_size
      desired_size = var.node_desired_size

      # Disk
      disk_size = 50  # GB

      # Labels for node affinity (optional)
      labels = {
        role = "general"
        app  = "chattining"
      }

      # Tags
      tags = {
        Component = "compute"
      }
    }
  }

  # ── Access Management ──
  # Allow the current IAM user/role to manage the cluster
  enable_cluster_creator_admin_permissions = true

  tags = {
    Component = "kubernetes"
  }
}
