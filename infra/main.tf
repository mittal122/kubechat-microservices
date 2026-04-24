# ─────────────────────────────────────────────────────────────
# Terraform Main — Provider & Backend Configuration
# ─────────────────────────────────────────────────────────────
# Usage:
#   cd infra/
#   terraform init
#   terraform plan -out=plan.tfplan
#   terraform apply plan.tfplan
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - Terraform >= 1.7.0
#   - S3 bucket for state (create manually or use local state)
# ─────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }

  # ── Remote State Storage ──
  # Uncomment after creating the S3 bucket:
  #   aws s3 mb s3://chattining-terraform-state --region ap-south-1
  #
  # backend "s3" {
  #   bucket         = "chattining-terraform-state"
  #   key            = "eks/terraform.tfstate"
  #   region         = "ap-south-1"
  #   encrypt        = true
  #   dynamodb_table = "chattining-terraform-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "chattining"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}
