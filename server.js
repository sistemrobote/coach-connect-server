const express = require('express');
const axios = require('axios');
const cors = require('cors');

const { saveUserToken, getUserToken } = require('./users');

const app = express();
app.use(cors());
app.use(express.json());

const {
    STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET,
    REDIRECT_URI
} = process.env;

app.get('/test', (req, res) => {
    console.log(" Log from: '/test' !",)
    console.log(" STRAVA_CLIENT_ID:>>>", STRAVA_CLIENT_ID);
    res.status(200).send('API is working');
});

app.get('/auth/exchange_token', async (req, res) => {
    const { code } = req.query;
    console.log(" code:>>>", code)
    try {
        console.log(" STRAVA_CLIENT_ID:>>>", STRAVA_CLIENT_ID);
        console.log(" STRAVA_CLIENT_SECRET:>>>", STRAVA_CLIENT_SECRET);

        const response = await axios.post('https://www.strava.com/api/v3/oauth/token', {
            client_id: STRAVA_CLIENT_ID,
            client_secret: STRAVA_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
        });

        const { access_token, refresh_token, expires_at, athlete } = response.data;
        console.log(" response.data:", response.data)
        saveUserToken(athlete.id, { access_token, refresh_token, expires_at });

        res.redirect(`http://localhost:5173/activities?user_id=${athlete.id}`);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.get('/activities', async (req, res) => {
    const userId = req.query.user_id;
    console.log(" userId:", userId)
    const user = getUserToken(userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Optional: refresh token if expired
    if (Date.now() / 1000 >= user.expires_at) {
        try {
            const refreshResponse = await axios.post('https://www.strava.com/api/v3/oauth/token', {
                client_id: STRAVA_CLIENT_ID,
                client_secret: STRAVA_CLIENT_SECRET,
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
        const activities = await axios.get('https://www.strava.com/api/v3/athlete/activities?per_page=4', {
            headers: { Authorization: `Bearer ${updatedUser.access_token}` },
        });

        res.json(activities.data);
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});
app.get('/lastactivities', async (req, res) => {

    const userId = req.query.user_id;
    const user = getUserToken(userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    try {
        const oneWeekAgoEpoch = () => {
            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days in ms
            return Math.floor(oneWeekAgo.getTime() / 1000); // convert to seconds
        };
        const weekAgo = oneWeekAgoEpoch()
        const activities = await axios.get(`https://www.strava.com/api/v3/athlete/activities?after=${weekAgo}`, {
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