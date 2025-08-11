# Strava Connect Server

OAuth proxy server for Strava API integration with stable deployment URLs.

## Local Development

1. Uncomment local environment code in `secrets.js`
2. Set environment variables or use `.env` file
3. Run: `npm run dev`

## Deployment

### Automated Deployment (Recommended)

**Setup GitHub Actions (one-time):**
1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Add these repository secrets:
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key

**Deploy:**
- Push to `main` branch → Automatic deployment
- Or manually trigger from GitHub Actions tab

### Manual Deployment (Alternative)

**One-time setup:**
```bash
# Install AWS SAM CLI if not already installed
brew install aws-sam-cli  # macOS
# pip install aws-sam-cli  # Other platforms

# Configure AWS credentials
aws configure
```

**Deploy:**
```bash
./deploy.sh
```

### After First Deployment
1. Copy the API URL from deployment output (GitHub Actions or terminal)
2. Update Strava app settings at https://www.strava.com/settings/api
3. Set Authorization Callback Domain to the API URL
4. Update your client app's API base URL

**✅ The API URL remains stable across all deployments!**

## Architecture

- **AWS Lambda**: Serverless Node.js application
- **API Gateway**: RESTful API with stable URLs
- **DynamoDB**: User token storage
- **AWS Secrets Manager**: Secure credential storage
