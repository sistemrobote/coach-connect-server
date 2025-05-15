const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

console.log(" process.env.AWS_REGION:>>>>", process.env.AWS_REGION)
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

let cachedSecrets = null;

async function getStravaSecrets() {
    if (cachedSecrets) return cachedSecrets;

    try {
        const command = new GetSecretValueCommand({ SecretId: 'coach-connect-secrets' });
        const response = await secretsClient.send(command);
        cachedSecrets = JSON.parse(response.SecretString);
        return cachedSecrets;
    } catch (error) {
        console.error('❌ Failed to fetch secrets from Secrets Manager:', error);
        throw error;
    }
}

module.exports = { getStravaSecrets };
