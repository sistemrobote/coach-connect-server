#!/bin/bash

# Strava Connect Server Deployment Script
set -e

echo "🚀 Building and deploying Strava Connect Server..."

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    echo "❌ AWS SAM CLI is not installed. Please install it first:"
    echo "   pip install aws-sam-cli"
    echo "   or visit: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html"
    exit 1
fi

# Build the SAM application
echo "📦 Building SAM application..."
sam build

# Deploy the application
echo "🚀 Deploying to AWS..."
sam deploy

# Get the API URL
echo "✅ Deployment complete!"
echo "📋 Getting API URL..."
API_URL=$(aws cloudformation describe-stacks --stack-name strava-connect-server --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)

echo "🌐 Your API Gateway URL (stable): ${API_URL}"
echo ""
echo "📝 Next steps:"
echo "1. Update your Strava app's Authorization Callback Domain with: ${API_URL}"
echo "2. Update your client application's API base URL with: ${API_URL}"
echo ""
echo "🔄 For future deployments, just run: ./deploy.sh"