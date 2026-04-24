# ─────────────────────────────────────────────────────────────
# Outputs — Values needed after terraform apply
# ─────────────────────────────────────────────────────────────

# ── VPC ──
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "Private subnet IDs (worker nodes live here)"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "Public subnet IDs (load balancers, ingress)"
  value       = module.vpc.public_subnets
}

# ── EKS ──
output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_certificate_authority" {
  description = "Base64-encoded cluster CA certificate"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "configure_kubectl" {
  description = "Command to configure kubectl"
  value       = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.aws_region}"
}

# ── ECR ──
output "ecr_repository_urls" {
  description = "ECR repository URLs for all services"
  value = {
    for name, repo in aws_ecr_repository.services :
    name => repo.repository_url
  }
}

# ── Quick Start ──
output "next_steps" {
  description = "What to do after terraform apply"
  value       = <<-EOT
    
    ✅ Infrastructure provisioned! Next steps:
    
    1. Configure kubectl:
       ${format("aws eks update-kubeconfig --name %s --region %s", module.eks.cluster_name, var.aws_region)}
    
    2. Deploy K8s manifests:
       kubectl apply -f k8s/production/namespace.yaml
       kubectl apply -f k8s/production/
    
    3. Verify:
       kubectl get nodes
       kubectl get pods -n chattining
  EOT
}
