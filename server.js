require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { saveUserToken, getUserToken } = require('./users');
const { getStravaSecrets } = require('./secrets'); 

const app = express();
app.use(cors());
app.use(express.json());

app.get('/test', async (req, res) => {
    try {
        const secrets = await getStravaSecrets();
        console.log(" secrets:>>>", secrets)
        res.status(200).json({
            TEST: 'WORKs',
            STRAVA_CLIENT_ID: secrets.STRAVA_CLIENT_ID,
            STRAVA_CLIENT_SECRET: secrets.STRAVA_CLIENT_SECRET,
            REDIRECT_URI: secrets.REDIRECT_URI
        });
    } catch (err) {
        console.error('❌ Error in /test:', err);
        res.status(500).json({ error: 'Failed to fetch secrets' });
    }
});

app.get('/auth/exchange_token', async (req, res) => {
    const { code } = req.query;

    try {
        const secrets = await getStravaSecrets();
        const response = await axios.post('https://www.strava.com/api/v3/oauth/token', {
            client_id: secrets.STRAVA_CLIENT_ID,
            client_secret: secrets.STRAVA_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
        });

        const { access_token, refresh_token, expires_at, athlete } = response.data;
        console.log(" response.data:", response.data)
        saveUserToken(athlete.id, { access_token, refresh_token, expires_at });
        
        // res.redirect(`https://dzg90nkkg0y7c.cloudfront.net/activities?user_id=${athlete.id}`);
        // res.redirect(`http://localhost:5173/activities?user_id=${athlete.id}`);
        res.redirect(`${secrets.REDIRECT_URI}/activities?user_id=${athlete.id}`);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.get('/activities', async (req, res) => {
    const userId = req.query.user_id;
    const before = req.query.before;
    const after = req.query.after;
    const user = getUserToken(userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Refresh token if expired
    if (Date.now() / 1000 >= user.expires_at) {
        try {
            const secrets = await getStravaSecrets();
            const refreshResponse = await axios.post('https://www.strava.com/api/v3/oauth/token', {
                client_id: secrets.STRAVA_CLIENT_ID,
                client_secret: secrets.STRAVA_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: user.refresh_token,
            });

            const updated = refreshResponse.data;
            saveUserToken(userId, {
                access_token: updated.access_token,
                refresh_token: updated.refresh_token,
                expires_at: updated.expires_at
            });
        } catch (err) {
            return res.status(500).json({ error: 'Token refresh failed' });
        }
    }

    try {
        const updatedUser = getUserToken(userId);
        const activities = await axios.get(`https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}`, {
            headers: { Authorization: `Bearer ${updatedUser.access_token}` },
        });

        res.json(activities.data);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});
app.get('/athletes/stats', async (req, res) => {
    const userId = req.query.user_id;
    const user = getUserToken(userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Refresh token if expired
    if (Date.now() / 1000 >= user.expires_at) {
        try {
            const secrets = await getStravaSecrets();

            const refreshResponse = await axios.post('https://www.strava.com/api/v3/oauth/token', {
                client_id: secrets.STRAVA_CLIENT_ID,
                client_secret: secrets.STRAVA_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: user.refresh_token,
            });

            const updated = refreshResponse.data;
            saveUserToken(userId, {
                access_token: updated.access_token,
                refresh_token: updated.refresh_token,
                expires_at: updated.expires_at
            });
        } catch (err) {
            return res.status(500).json({ error: 'Token refresh failed' });
        }
    }
    try {
        const activities = await axios.get(`https://www.strava.com/api/v3/athletes/${userId}/stats`, {
            headers: { Authorization: `Bearer ${user.access_token}` },
        });
        res.json(activities.data);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

module.exports = app;

// Local mode
if (require.main === module) {
    const PORT = process.env.PORT || 5050;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}