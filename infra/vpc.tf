# ─────────────────────────────────────────────────────────────
# VPC — Virtual Private Cloud for EKS
# ─────────────────────────────────────────────────────────────
# Architecture:
#   - 2 public subnets (NAT Gateway, Load Balancers, Ingress)
#   - 2 private subnets (EKS worker nodes, databases)
#   - Multi-AZ deployment for high availability
#   - NAT Gateway for private subnet internet access
# ─────────────────────────────────────────────────────────────

data "aws_availability_zones" "available" {
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.5"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr

  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.20.0/24"]

  # ── NAT Gateway ──
  # Single NAT gateway to save cost in dev/staging
  # Set to true for production (one per AZ)
  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true
  enable_dns_support   = true

  # ── Subnet Tags (required for EKS) ──
  # These tags tell the AWS Load Balancer Controller which subnets to use
  public_subnet_tags = {
    "kubernetes.io/role/elb"                    = 1
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"           = 1
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  tags = {
    Component = "networking"
  }
}
