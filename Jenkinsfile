// Mirrors the GitHub Actions CI pipeline (.github/workflows/ci.yml) and
// additionally packages a ready-to-deploy plugin bundle as a build artifact.
//
// Runs on a Jenkins multibranch pipeline that discovers main and pull
// requests from GitHub; events arrive through a webhook relay, with a
// periodic scan as fallback.
//
// The commitlint job from the GitHub Actions workflow is intentionally not
// replicated here: it validates pull request commit ranges, which only exist
// in the PR-triggered context.
pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {
        stage('Install') {
            steps {
                sh 'node --version && npm --version'
                sh 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                sh 'npm run lint'
            }
        }

        stage('Type-check') {
            steps {
                sh 'npm run typecheck'
            }
        }

        stage('Test') {
            steps {
                sh 'npm run test:coverage'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Package') {
            steps {
                // Deployable bundle: unzip into <vault>/.obsidian/plugins/
                sh '''
                    VERSION=$(node -p "require('./manifest.json').version")
                    rm -rf dist
                    mkdir -p dist/image-baker
                    cp main.js manifest.json styles.css dist/image-baker/
                    cd dist && zip -r "image-baker-${VERSION}.zip" image-baker
                '''
            }
        }
    }

    post {
        success {
            archiveArtifacts artifacts: 'dist/image-baker-*.zip', fingerprint: true
        }
        cleanup {
            sh 'rm -rf dist'
        }
    }
}
