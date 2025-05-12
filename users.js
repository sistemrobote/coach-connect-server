const userTokens = new Map(); // key: strava_user_id, value: { access_token, refresh_token, expires_at }

console.log(" userTokens:", userTokens)
module.exports = {
    saveUserToken: (userId, tokens) => {
        const id = String(userId);
        userTokens.set(id, tokens);
        console.log(`[saveUserToken] Stored user ${id}`);
    },
    getUserToken: (userId) => {
        const id = String(userId);
        console.log(`[getUserToken] Getting user ${id}`);
        return userTokens.get(id);
    },
    getAllUsers: () => [...userTokens.keys()]
};
