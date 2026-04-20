pipeline {
    agent any

    environment {
        // These refer to the credential ID we will create in Jenkins
        DOCKER_CREDENTIALS_ID = 'dockerhub-creds'
        BACKEND_IMAGE = 'mittal122/kubechat-microservices-backend'
        FRONTEND_IMAGE = 'mittal122/kubechat-microservices-frontend'
    }

    stages {
        stage('Checkout Code') {
            steps {
                // Pulls the latest code from GitHub
                checkout scm
            }
        }

        stage('Build Backend Image') {
            steps {
                script {
                    echo "Building Backend Image..."
                    def backendApp = docker.build("${BACKEND_IMAGE}:latest", "./backend")
                }
            }
        }

        stage('Push Backend Image') {
            steps {
                script {
                    echo "Pushing Backend Image to Docker Hub..."
                    docker.withRegistry('https://index.docker.io/v1/', DOCKER_CREDENTIALS_ID) {
                        docker.image("${BACKEND_IMAGE}:latest").push()
                    }
                }
            }
        }

        stage('Build Frontend Image') {
            steps {
                script {
                    echo "Building Frontend Image..."
                    def frontendApp = docker.build("${FRONTEND_IMAGE}:latest", "./frontend")
                }
            }
        }

        stage('Push Frontend Image') {
            steps {
                script {
                    echo "Pushing Frontend Image to Docker Hub..."
                    docker.withRegistry('https://index.docker.io/v1/', DOCKER_CREDENTIALS_ID) {
                        docker.image("${FRONTEND_IMAGE}:latest").push()
                    }
                }
            }
        }
    }
    
    post {
        success {
            echo "Successfully built and pushed all images to Docker Hub! 🎉"
        }
        failure {
            echo "Pipeline failed 😢. Check the Jenkins logs for details."
        }
    }
}
