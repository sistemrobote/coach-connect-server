require('dotenv').config(); 

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });


async function getStravaSecrets() {
    console.log(" from secrets >:")
    console.log(" process.env.NODE_ENV:", process.env.NODE_ENV)
    // if ((process?.env?.NODE_ENV && process.env.NODE_ENV) === 'local') {
    //     let cachedSecrets = {
    //         STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
    //         STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
    //         REDIRECT_URI: process.env.REDIRECT_URI,
    //     };
    //     return cachedSecrets;
    // }
    try {
        const command = new GetSecretValueCommand({ SecretId: 'coach-connect-secrets' });
        console.log(" command:", command)
        const response = await secretsClient.send(command);
        console.log(" response.SecretString:", response.SecretString)
        if (!response.SecretString) {
            throw new Error('SecretString missing in Secrets Manager response');
        }
        console.log(" JSON.parse(response.SecretString):", JSON.parse(response.SecretString))
        let cachedSecrets = JSON.parse(response.SecretString);
        console.log(" cachedSecrets:", cachedSecrets)
        return cachedSecrets;
    } catch (error) {
        console.error('❌ Failed to fetch secrets from Secrets Manager:', error);
        throw error;
    }
}

module.exports = { getStravaSecrets };
