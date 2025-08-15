const express = require("express");
const axios = require("axios");
const { authenticateJWT } = require("../auth");
const { getStravaSecrets } = require("../secrets");
const {
  saveUserToken,
  getUserToken,
  saveUserProfile,
  getUserTokens,
} = require("../users");

const router = express.Router();

/**
 * Enhanced activities endpoint with JWT authentication
 */
router.get("/activities", authenticateJWT, async (req, res) => {
  const { before, after, per_page = 200 } = req.query;
  const userId = req.user.userId;

  console.log(`[Activities] Fetching activities for user ${userId}`);

  try {
    // Get user's Strava tokens using new enhanced function
    let userTokens = await getUserTokens(userId);
    if (!userTokens) {
      return res.status(404).json({ error: "User tokens not found" });
    }

    // Check if token needs refresh
    if (Date.now() / 1000 >= userTokens.expires_at) {
      console.log(
        `[Activities] Token expired for user ${userId}, refreshing...`
      );

      try {
        const secrets = await getStravaSecrets();
        const refreshResponse = await axios.post(
          "https://www.strava.com/api/v3/oauth/token",
          {
            client_id: secrets.STRAVA_CLIENT_ID,
            client_secret: secrets.STRAVA_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: userTokens.refresh_token,
          }
        );

        const updated = refreshResponse.data;

        // Update tokens in new format
        await saveUserProfile(userId, req.user, {
          access_token: updated.access_token,
          refresh_token: updated.refresh_token,
          expires_at: updated.expires_at,
          scope: updated.scope || userTokens.scope,
        });

        // Also update in legacy format for backward compatibility
        await saveUserToken(userId, {
          access_token: updated.access_token,
          refresh_token: updated.refresh_token,
          expires_at: updated.expires_at,
        });

        userTokens = {
          access_token: updated.access_token,
          refresh_token: updated.refresh_token,
          expires_at: updated.expires_at,
          scope: updated.scope || userTokens.scope,
        };

        console.log(`[Activities] Token refreshed for user ${userId}`);
      } catch (err) {
        console.error(
          `[Activities] Token refresh failed for user ${userId}:`,
          err
        );
        return res.status(500).json({ error: "Token refresh failed" });
      }
    }

    // Fetch activities from Strava
    const activitiesUrl = `https://www.strava.com/api/v3/athlete/activities?per_page=${per_page}${
      after ? `&after=${after}` : ""
    }${before ? `&before=${before}` : ""}`;

    const activities = await axios.get(activitiesUrl, {
      headers: { Authorization: `Bearer ${userTokens.access_token}` },
    });

    console.log(
      `[Activities] Retrieved ${activities.data.length} activities for user ${userId}`
    );

    res.json({
      success: true,
      count: activities.data.length,
      activities: activities.data,
    });
  } catch (err) {
    console.error(
      `[Activities] Error for user ${userId}:`,
      err.response?.data || err.message
    );
    res.status(500).json({
      error: "Failed to fetch activities",
      message: err.response?.data?.message || err.message,
    });
  }
});

/**
 * Enhanced athlete stats endpoint with JWT authentication
 */
router.get("/athletes/stats", authenticateJWT, async (req, res) => {
  const userId = req.user.userId;

  console.log(`[Athlete Stats] Fetching stats for user ${userId}`);

  try {
    // Get user's Strava tokens
    let userTokens = await getUserTokens(userId);
    if (!userTokens) {
      return res.status(404).json({ error: "User tokens not found" });
    }

    // Check if token needs refresh
    if (Date.now() / 1000 >= userTokens.expires_at) {
      console.log(
        `[Athlete Stats] Token expired for user ${userId}, refreshing...`
      );

      try {
        const secrets = await getStravaSecrets();
        const refreshResponse = await axios.post(
          "https://www.strava.com/api/v3/oauth/token",
          {
            client_id: secrets.STRAVA_CLIENT_ID,
            client_secret: secrets.STRAVA_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: userTokens.refresh_token,
          }
        );

        const updated = refreshResponse.data;

        // Update tokens in both new and legacy formats
        await saveUserProfile(userId, req.user, {
          access_token: updated.access_token,
          refresh_token: updated.refresh_token,
          expires_at: updated.expires_at,
          scope: updated.scope || userTokens.scope,
        });

        await saveUserToken(userId, {
          access_token: updated.access_token,
          refresh_token: updated.refresh_token,
          expires_at: updated.expires_at,
        });

        userTokens.access_token = updated.access_token;
        console.log(`[Athlete Stats] Token refreshed for user ${userId}`);
      } catch (err) {
        console.error(
          `[Athlete Stats] Token refresh failed for user ${userId}:`,
          err
        );
        return res.status(500).json({ error: "Token refresh failed" });
      }
    }

    // Fetch athlete stats from Strava
    const stats = await axios.get(
      `https://www.strava.com/api/v3/athletes/${userId}/stats`,
      {
        headers: { Authorization: `Bearer ${userTokens.access_token}` },
      }
    );

    console.log(`[Athlete Stats] Retrieved stats for user ${userId}`);

    res.json({
      success: true,
      stats: stats.data,
    });
  } catch (err) {
    console.error(
      `[Athlete Stats] Error for user ${userId}:`,
      err.response?.data || err.message
    );
    res.status(500).json({
      error: "Failed to fetch athlete stats",
      message: err.response?.data?.message || err.message,
    });
  }
});

/**
 * Legacy endpoint to invalidate tokens
 */
router.delete("/auth/invalidate_token", async (req, res) => {
  const userId = req.query.user_id;
  const user = await getUserToken(userId);

  if (!user) return res.status(404).json({ error: "User not found" });

  try {
    await axios.post("https://www.strava.com/oauth/deauthorize", null, {
      headers: { Authorization: `Bearer ${user.access_token}` },
    });
  } catch (err) {
    // It's OK to continue, even if deauth fails (maybe already expired)
    console.error("Failed to deauthorize on Strava:", err.message);
  }

  // Remove from your local storage (adjust depending on your implementation)
  await saveUserToken(userId, null);

  res.json({ success: true, message: "Token invalidated" });
});

module.exports = router;