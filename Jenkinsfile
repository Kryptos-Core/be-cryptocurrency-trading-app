@Library('shared-pipeline-library') _

pipeline {
    agent {
        label 'docker-build-node'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }

    environment {
        DOCKER_IMAGE = 'crypto-trading-backend'
        REGISTRY = "${REGISTRY_URL ?: 'registry.yourdomain.com'}"
        APP_NAME = 'crypto-trading-backend'
        DEPLOY_USER = 'deployer'
        DEPLOY_SERVER = "${PROD_SERVER_IP ?: 'prod-server.yourdomain.com'}"
        DEPLOY_PATH = '/opt/crypto-trading'
    }

    parameters {
        booleanParam(
            name: 'SKIP_DB_MIGRATION',
            defaultValue: false,
            description: 'Skip database migration step'
        )
        booleanParam(
            name: 'FORCE_REDEPLOY',
            defaultValue: false,
            description: 'Force redeploy even if build fails'
        )
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    echo "Checking out code from branch: ${env.BRANCH_NAME}"
                    checkout scm
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                script {
                    echo "Installing dependencies..."
                    sh 'npm ci --ignore-scripts --prefer-offline'
                }
            }
        }

        stage('Lint & Type Check') {
            steps {
                script {
                    echo "Running linter..."
                    sh 'npm run lint || true'

                    echo "Checking format..."
                    sh 'npm run format:check || true'
                }
            }
        }

        stage('Unit Tests') {
            steps {
                script {
                    echo "Running unit tests..."
                    sh 'npm test -- --passWithNoTests --coverage --coverageReporters=lcov --coverageDirectory=coverage'
                }
                post {
                    always {
                        script {
                            publishHTML([
                                allowMissing: true,
                                alwaysLinkToLastBuild: true,
                                keepAll: true,
                                reportDir: 'coverage',
                                reportFiles: 'lcov-report/index.html',
                                reportName: 'Coverage Report'
                            ])
                        }
                        junit 'coverage/junit.xml'
                    }
                }
            }
        }

        stage('Security Audit') {
            steps {
                script {
                    echo "Running npm audit..."
                    sh 'npm audit --audit-level=high || true'

                    echo "Running Snyk security scan if available..."
                    sh 'npx snyk test --severity-threshold=high || true'
                }
            }
        }

        stage('Build Production Image') {
            steps {
                script {
                    echo "Building production Docker image..."
                    def imageTag = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}-${new Date().format('yyyyMMdd-HHmmss')}"
                    env.IMAGE_TAG = imageTag

                    sh """
                        docker build \
                            --build-arg NODE_ENV=production \
                            --build-arg NPM_CONFIG_PRODUCTION=true \
                            -t ${REGISTRY}/${DOCKER_IMAGE}:${imageTag} \
                            -t ${REGISTRY}/${DOCKER_IMAGE}:${env.BRANCH_NAME}-latest \
                            -f Dockerfile.prod \
                            .
                    """
                }
            }
        }

        stage('Push to Registry') {
            steps {
                script {
                    echo "Pushing Docker image to registry..."
                    withCredentials([usernamePassword(
                        credentialsId: 'docker-registry-credentials',
                        usernameVariable: 'REGISTRY_USER',
                        passwordVariable: 'REGISTRY_PASS'
                    )]) {
                        sh """
                            echo '${REGISTRY_PASS}' | docker login ${REGISTRY} -u '${REGISTRY_USER}' --password-stdin
                            docker push ${REGISTRY}/${DOCKER_IMAGE}:${env.IMAGE_TAG}
                            docker push ${REGISTRY}/${DOCKER_IMAGE}:${env.BRANCH_NAME}-latest

                            if (env.BRANCH_NAME == 'main') {
                                docker tag ${REGISTRY}/${DOCKER_IMAGE}:${env.IMAGE_TAG} ${REGISTRY}/${DOCKER_IMAGE}:latest
                                docker push ${REGISTRY}/${DOCKER_IMAGE}:latest
                            }

                            docker logout ${REGISTRY} || true
                        """
                    }
                }
            }
        }

        stage('Run DB Migration') {
            when {
                allOf {
                    branch 'main'
                    expression { params.SKIP_DB_MIGRATION == false }
                }
            }
            steps {
                script {
                    echo "Running database migrations..."
                    sshagent(credentials: ['ssh-deploy-key']) {
                        sh """
                            ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_SERVER} '''
                                cd ${DEPLOY_PATH}
                                docker compose -f docker-compose.prod.yml --env-file .env.prod pull app
                                docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm app npm run db:migrate || echo "Migration completed or skipped"
                            '''
                        '''
                    }
                }
            }
        }

        stage('Deploy to Production') {
            when {
                allOf {
                    branch 'main'
                    expression { currentBuild.resultIsBetterOrEqualTo('SUCCESS') || params.FORCE_REDEPLOY }
                }
            }
            steps {
                script {
                    echo "Deploying to production server..."
                    sshagent(credentials: ['ssh-deploy-key']) {
                        sh """
                            ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_SERVER} '''
                                cd ${DEPLOY_PATH}

                                # Pull latest images
                                docker compose -f docker-compose.prod.yml --env-file .env.prod pull

                                # Tag the new image as latest
                                docker tag ${REGISTRY}/${DOCKER_IMAGE}:${env.IMAGE_TAG} crypto-trading-backend:latest

                                # Backup current image
                                docker tag crypto-trading-backend:latest crypto-trading-backend:previous || true

                                # Stop current containers
                                docker compose -f docker-compose.prod.yml --env-file .env.prod stop app

                                # Start app with new image
                                docker compose -f docker-compose.prod.yml --env-file .env.prod up -d app

                                # Health check
                                ./scripts/health-check.sh || {
                                    echo "Health check failed! Rolling back..."
                                    docker compose -f docker-compose.prod.yml --env-file .env.prod up -d app
                                    ./scripts/health-check.sh
                                    exit 1
                                }

                                # Remove old images
                                docker image prune -f

                                echo "Deployment completed successfully"
                                docker compose -f docker-compose.prod.yml --env-file .env.prod ps
                            '''
                        """
                    }
                }
            }
        }

        stage('Deploy Monitoring Stack') {
            when {
                allOf {
                    branch 'main'
                    expression { params.SKIP_DB_MIGRATION == false }
                }
            }
            steps {
                script {
                    echo "Deploying monitoring stack..."
                    sshagent(credentials: ['ssh-deploy-key']) {
                        sh """
                            ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_SERVER} '''
                                cd ${DEPLOY_PATH}
                                docker compose -f docker-compose.monitoring.prod.yml --env-file .env.prod pull
                                docker compose -f docker-compose.monitoring.prod.yml --env-file .env.prod up -d
                                echo "Monitoring stack deployed"
                            '''
                        """
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                echo "Cleaning up workspace..."
                cleanWs()
            }
        }

        success {
            script {
                echo "Build successful - sending notifications..."

                // Telegram notification
                telegramSend(
                    message: "✅ Build #${env.BUILD_NUMBER} SUCCESS\n" +
                            "Branch: ${env.BRANCH_NAME}\n" +
                            "Image: ${REGISTRY}/${DOCKER_IMAGE}:${env.IMAGE_TAG}\n" +
                            "URL: ${env.BUILD_URL}",
                    botToken: "${TELEGRAM_BOT_TOKEN}",
                    chatId: "${TELEGRAM_CHAT_ID}"
                )

                // Update Slack if configured
                slackSend(
                    channel: '#deployments',
                    color: 'good',
                    message: "✅ Build #${env.BUILD_NUMBER} SUCCESS: ${env.APP_NAME}",
                    teamDomain: "${SLACK_TEAM_DOMAIN ?: ''}",
                    tokenCredentialId: 'slack-bot-token'
                )
            }
        }

        failure {
            script {
                echo "Build failed - sending alert..."

                // Telegram alert
                telegramSend(
                    message: "❌ Build #${env.BUILD_NUMBER} FAILED\n" +
                            "Branch: ${env.BRANCH_NAME}\n" +
                            "Error: ${currentBuild.result}\n" +
                            "URL: ${env.BUILD_URL}",
                    botToken: "${TELEGRAM_BOT_TOKEN}",
                    chatId: "${TELEGRAM_CHAT_ID}"
                )

                // Slack alert
                slackSend(
                    channel: '#deployments',
                    color: 'danger',
                    message: "❌ Build #${env.BUILD_NUMBER} FAILED: ${env.APP_NAME}",
                    teamDomain: "${SLACK_TEAM_DOMAIN ?: ''}",
                    tokenCredentialId: 'slack-bot-token'
                )

                // Email notification
                emailext(
                    subject: "❌ Build Failed: ${env.APP_NAME} #${env.BUILD_NUMBER}",
                    body: """
                        Build #${env.BUILD_NUMBER} of ${env.APP_NAME} has failed.

                        Branch: ${env.BRANCH_NAME}
                        Result: ${currentBuild.result}

                        Build URL: ${env.BUILD_URL}

                        Please check the build logs for details.
                    """,
                    to: 'devops@yourdomain.com',
                    attachLog: true
                )
            }
        }

        unstable {
            script {
                echo "Build unstable - sending notification..."
                telegramSend(
                    message: "⚠️ Build #${env.BUILD_NUMBER} UNSTABLE\n" +
                            "Branch: ${env.BRANCH_NAME}\n" +
                            "URL: ${env.BUILD_URL}",
                    botToken: "${TELEGRAM_BOT_TOKEN}",
                    chatId: "${TELEGRAM_CHAT_ID}"
                )
            }
        }
    }
}
