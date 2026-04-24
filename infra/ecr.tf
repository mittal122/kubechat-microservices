# ─────────────────────────────────────────────────────────────
# ECR — Container Registries for Microservice Images
# ─────────────────────────────────────────────────────────────
# Creates 5 ECR repositories matching the CI/CD pipeline:
#   - chattining-gateway
#   - chattining-auth
#   - chattining-user
#   - chattining-chat
#   - chattining-frontend
# ─────────────────────────────────────────────────────────────

locals {
  ecr_repositories = [
    "chattining-gateway",
    "chattining-auth",
    "chattining-user",
    "chattining-chat",
    "chattining-frontend",
  ]
}

resource "aws_ecr_repository" "services" {
  for_each = toset(local.ecr_repositories)

  name                 = each.key
  image_tag_mutability = "IMMUTABLE"  # Prevents tag overwriting

  image_scanning_configuration {
    scan_on_push = true  # Auto-scan images for CVEs on push
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Component = "registry"
    Service   = each.key
  }
}

# ── Lifecycle Policy ──
# Keep only the latest N images to save storage costs
resource "aws_ecr_lifecycle_policy" "cleanup" {
  for_each   = toset(local.ecr_repositories)
  repository = aws_ecr_repository.services[each.key].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last ${var.ecr_image_retention_count} images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.ecr_image_retention_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
