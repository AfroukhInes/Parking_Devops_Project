pipeline {
  agent any

  stages {

    stage('Build Docker images') {
      steps {
        sh 'docker build -t reservation ./reservation-service'
        sh 'docker build -t billing ./billing-service'
        sh 'docker build -t frontend -f frontend/Dockerfile frontend'
      }
    }

    stage('Kubernetes Deploy') {
      steps {
        sh 'kubectl apply -f k8s/'
      }
    }
  }
}
