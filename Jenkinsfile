pipeline {
    agent any

    environment {
        // Jenkins credential ID for Docker Hub (configure in Jenkins → Manage Credentials)
        DOCKER_CREDENTIALS_ID = 'dockerhub-creds'
        GATEWAY_IMAGE  = 'mittal122/chattining-gateway'
        AUTH_IMAGE      = 'mittal122/chattining-auth'
        USER_IMAGE      = 'mittal122/chattining-user'
        CHAT_IMAGE      = 'mittal122/chattining-chat'
        FRONTEND_IMAGE  = 'mittal122/chattining-frontend'
    }

    stages {
        stage('Checkout Code') {
            steps {
                checkout scm
            }
        }

        stage('Build Microservice Images') {
            parallel {
                stage('API Gateway') {
                    steps {
                        script {
                            echo "Building API Gateway..."
                            docker.build("${GATEWAY_IMAGE}:latest", "./services/api-gateway")
                        }
                    }
                }
                stage('Auth Service') {
                    steps {
                        script {
                            echo "Building Auth Service..."
                            docker.build("${AUTH_IMAGE}:latest", "./services/auth-service")
                        }
                    }
                }
                stage('User Service') {
                    steps {
                        script {
                            echo "Building User Service..."
                            docker.build("${USER_IMAGE}:latest", "./services/user-service")
                        }
                    }
                }
                stage('Chat Service') {
                    steps {
                        script {
                            echo "Building Chat Service..."
                            docker.build("${CHAT_IMAGE}:latest", "./services/chat-service")
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        script {
                            echo "Building Frontend..."
                            docker.build("${FRONTEND_IMAGE}:latest", "./frontend")
                        }
                    }
                }
            }
        }

        stage('Push All Images') {
            steps {
                script {
                    echo "Pushing all images to Docker Hub..."
                    docker.withRegistry('https://index.docker.io/v1/', DOCKER_CREDENTIALS_ID) {
                        docker.image("${GATEWAY_IMAGE}:latest").push()
                        docker.image("${GATEWAY_IMAGE}:latest").push("${env.BUILD_NUMBER}")
                        docker.image("${AUTH_IMAGE}:latest").push()
                        docker.image("${AUTH_IMAGE}:latest").push("${env.BUILD_NUMBER}")
                        docker.image("${USER_IMAGE}:latest").push()
                        docker.image("${USER_IMAGE}:latest").push("${env.BUILD_NUMBER}")
                        docker.image("${CHAT_IMAGE}:latest").push()
                        docker.image("${CHAT_IMAGE}:latest").push("${env.BUILD_NUMBER}")
                        docker.image("${FRONTEND_IMAGE}:latest").push()
                        docker.image("${FRONTEND_IMAGE}:latest").push("${env.BUILD_NUMBER}")
                    }
                }
            }
        }

        stage('Security Scan (Trivy)') {
            steps {
                script {
                    echo "Scanning all images for vulnerabilities with Trivy..."
                    def images = [
                        GATEWAY_IMAGE,
                        AUTH_IMAGE,
                        USER_IMAGE,
                        CHAT_IMAGE,
                        FRONTEND_IMAGE
                    ]
                    for (img in images) {
                        echo "Scanning ${img}:latest..."
                        sh """
                            trivy image --severity CRITICAL,HIGH \
                              --exit-code 0 \
                              --format table \
                              ${img}:latest
                        """
                    }
                    echo "Security scan complete ✅"
                }
            }
        }
    }

    post {
        success {
            echo "Successfully built, scanned, and pushed all 5 microservice images to Docker Hub! 🎉"
        }
        failure {
            echo "Pipeline failed 😢. Check the Jenkins logs for details."
        }
    }
}
