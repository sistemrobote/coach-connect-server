require('dotenv').config(); 

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });


async function getStravaSecrets() {
    console.log(" process.env.NODE_ENV:", process.env.NODE_ENV)
    //* Uncomment this code to run locally
    // if (process.env.NODE_ENV === 'local') {
    //     let cachedSecrets = {
    //         STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
    //         STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
    //         REDIRECT_URI: process.env.REDIRECT_URI,
    //     };
    //     return cachedSecrets;
    // } else {
        console.log(" from secrets >:")
        const command = new GetSecretValueCommand({ SecretId: 'coach-connect-secrets' });
        const response = await secretsClient.send(command);
        if (!response.SecretString) {
            throw new Error('SecretString missing in Secrets Manager response');
        }
        let cachedSecrets = JSON.parse(response.SecretString);
        return cachedSecrets;
    // } 
}

module.exports = { getStravaSecrets };
