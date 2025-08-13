require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cookieParser = require("cookie-parser");

// Import enhanced user functions and JWT utilities
const {
  saveUserToken,
  getUserToken,
  saveUserProfile,
  getUserProfile,
  getUserTokens,
  updateUserProfile,
} = require("./users");
const { getStravaSecrets } = require("./secrets");
const { createUserJWT, authenticateJWT, optionalAuth } = require("./auth");

const app = express();

// Enhanced CORS configuration for cookies
app.use(
  cors({
    origin: [process.env.FRONTEND_URL, "http://localhost:5173"].filter(Boolean),
    credentials: true, // Allow cookies to be sent
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

app.use(express.json());
app.use(cookieParser()); // Parse cookies from requests

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  next();
});

// AUTH USER HERE!
app.get("/auth/exchange_token", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Authorization code is required" });
  }

  try {
    const secrets = await getStravaSecrets();

    // Exchange code for tokens
    const response = await axios.post(
      "https://www.strava.com/api/v3/oauth/token",
      {
        client_id: secrets.STRAVA_CLIENT_ID,
        client_secret: secrets.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
      }
    );

    const { access_token, refresh_token, expires_at, athlete, scope } =
      response.data;
    console.log(`[OAuth] Successfully authenticated user ${athlete.id}`);
    console.log("🚀 ~ athlete>>", athlete);

    // Save enhanced user profile and tokens
    await saveUserProfile(
      athlete.id,
      athlete, // Strava user profile data
      {
        // OAuth tokens
        access_token,
        refresh_token,
        expires_at,
        scope,
        token_type: response.data.token_type,
      },
      {
        // Additional app data
        preferences: {},
        settings: { theme: "light", notifications: true },
        subscription_tier: "free",
      }
    );

    // Create JWT for application authentication
    const jwtToken = createUserJWT(athlete, { scope });

    // Set secure HTTP-only cookie with JWT
    res.cookie("auth_token", jwtToken, {
      httpOnly: true, // Prevent XSS access
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      sameSite: "strict", // CSRF protection
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/", // Available site-wide
    });

    console.log(`[OAuth] JWT cookie set for user ${athlete.id}`);

    // Also maintain backward compatibility by saving to old format
    await saveUserToken(athlete.id, {
      access_token,
      refresh_token,
      expires_at,
    });

    // Redirect to dashboard/frontend with user info
    const redirectUrl = `${secrets.REDIRECT_URI}/dashboard`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error(
      "[OAuth] Exchange token error:",
      err.response?.data || err.message
    );
    res.status(500).json({
      error: "Authentication failed",
      message: "Unable to complete Strava authentication", //!
    });
  }
});

// Enhanced activities endpoint with JWT authentication
app.get("/activities", authenticateJWT, async (req, res) => {
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
// Enhanced athlete stats endpoint with JWT authentication
app.get("/athletes/stats", authenticateJWT, async (req, res) => {
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

app.delete("/auth/invalidate_token", async (req, res) => {
  console.log(" /auth/invalidate_token:");
  const userId = req.query.user_id;
  const user = await getUserToken(userId);

  if (!user) return res.status(404).json({ error: "User not found" });

  try {
    await axios.post("https://www.strava.com/oauth/deauthorize", null, {
      headers: { Authorization: `Bearer ${user.access_token}` },
    });
  } catch (err) {
    // It’s OK to continue, even if deauth fails (maybe already expired)
    console.error("Failed to deauthorize on Strava:", err.message);
  }

  // Remove from your local storage (adjust depending on your implementation)
  await saveUserToken(userId, null);

  res.json({ success: true, message: "Token invalidated" });
});

// New JWT-based authentication endpoints

/**
 * Logout endpoint - clears JWT cookie and optionally revokes Strava tokens
 */
app.post("/auth/logout", optionalAuth, async (req, res) => {
  console.log("[Logout] Processing logout request");

  const { revoke_strava = false } = req.body;

  try {
    // If user is authenticated and wants to revoke Strava access
    if (req.user && revoke_strava) {
      const tokens = await getUserTokens(req.user.userId);
      if (tokens) {
        try {
          await axios.post("https://www.strava.com/oauth/deauthorize", null, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          console.log(
            `[Logout] Revoked Strava access for user ${req.user.userId}`
          );
        } catch (err) {
          console.warn(
            `[Logout] Failed to revoke Strava access: ${err.message}`
          );
        }
      }
    }

    // Clear the JWT cookie
    res.clearCookie("auth_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    console.log("[Logout] JWT cookie cleared");

    res.json({
      success: true,
      message: "Logged out successfully",
      strava_revoked: req.user && revoke_strava,
    });
  } catch (error) {
    console.error("[Logout] Error during logout:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

/**
 * Check authentication status - returns user info if authenticated
 */
app.get("/auth/me", authenticateJWT, async (req, res) => {
  try {
    // Get full user profile from database
    const userProfile = await getUserProfile(req.user.userId);

    if (!userProfile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // Return safe user information (no sensitive tokens)
    res.json({
      success: true,
      user: {
        id: req.user.userId,
        username: req.user.username,
        firstname: req.user.firstname,
        lastname: req.user.lastname,
        profile: userProfile.profile,
        preferences: userProfile.preferences || {},
        settings: userProfile.settings || {},
        subscription_tier: userProfile.subscription_tier || "free",
        created_at: userProfile.created_at,
        last_login: userProfile.last_login,
      },
    });
  } catch (error) {
    console.error("[Auth Me] Error:", error);
    res.status(500).json({ error: "Failed to get user information" });
  }
});

/**
 * Refresh JWT token endpoint
 */
app.post("/auth/refresh", authenticateJWT, async (req, res) => {
  try {
    // Get user profile to create fresh JWT
    const userProfile = await getUserProfile(req.user.userId);
    if (!userProfile) {
      return res.status(404).json({ error: "User not found" });
    }

    // Create new JWT
    const newJWT = createUserJWT(userProfile.profile, {
      scope: req.user.scope,
    });

    // Set new cookie
    res.cookie("auth_token", newJWT, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({
      success: true,
      message: "Token refreshed successfully",
      expires_in: 24 * 60 * 60, // 24 hours in seconds
    });
  } catch (error) {
    console.error("[Refresh Token] Error:", error);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// User Profile Management Endpoints

/**
 * Update user profile preferences and settings
 */
app.put("/user/profile", authenticateJWT, async (req, res) => {
  const userId = req.user.userId;
  const { preferences, settings, subscription_tier } = req.body;

  console.log(`[Update Profile] Updating profile for user ${userId}`);

  try {
    // Validate input
    const allowedUpdates = {};

    if (preferences && typeof preferences === "object") {
      allowedUpdates.preferences = preferences;
    }

    if (settings && typeof settings === "object") {
      allowedUpdates.settings = settings;
    }

    if (
      subscription_tier &&
      ["free", "premium", "pro"].includes(subscription_tier)
    ) {
      allowedUpdates.subscription_tier = subscription_tier;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({
        error: "No valid updates provided",
        message:
          "Provide preferences, settings, or subscription_tier to update",
      });
    }

    // Update the profile
    const success = await updateUserProfile(userId, allowedUpdates);

    if (!success) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // Get updated profile to return
    const updatedProfile = await getUserProfile(userId);

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: userId,
        preferences: updatedProfile.preferences || {},
        settings: updatedProfile.settings || {},
        subscription_tier: updatedProfile.subscription_tier || "free",
        updated_at: updatedProfile.updated_at,
      },
    });
  } catch (error) {
    console.error(`[Update Profile] Error for user ${userId}:`, error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/**
 * Get user's full profile data
 */
app.get("/user/profile", authenticateJWT, async (req, res) => {
  const userId = req.user.userId;

  try {
    const userProfile = await getUserProfile(userId);

    if (!userProfile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    res.json({
      success: true,
      user: {
        id: userId,
        profile: userProfile.profile,
        preferences: userProfile.preferences || {},
        settings: userProfile.settings || {},
        subscription_tier: userProfile.subscription_tier || "free",
        created_at: userProfile.created_at,
        updated_at: userProfile.updated_at,
        last_login: userProfile.last_login,
      },
    });
  } catch (error) {
    console.error(`[Get Profile] Error for user ${userId}:`, error);
    res.status(500).json({ error: "Failed to get user profile" });
  }
});

/**
 * Delete user account and all associated data
 */
app.delete("/user/account", authenticateJWT, async (req, res) => {
  const userId = req.user.userId;
  const { confirm_deletion } = req.body;

  console.log(
    `[Delete Account] Processing deletion request for user ${userId}`
  );

  if (!confirm_deletion) {
    return res.status(400).json({
      error: "Deletion not confirmed",
      message:
        "Include 'confirm_deletion: true' in request body to confirm account deletion",
    });
  }

  try {
    // First, try to revoke Strava tokens
    const tokens = await getUserTokens(userId);
    if (tokens) {
      try {
        await axios.post("https://www.strava.com/oauth/deauthorize", null, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        console.log(
          `[Delete Account] Revoked Strava access for user ${userId}`
        );
      } catch (err) {
        console.warn(
          `[Delete Account] Failed to revoke Strava access: ${err.message}`
        );
        // Continue with deletion even if Strava revocation fails
      }
    }

    // Delete all user data from database
    const success = await deleteUserData(userId);

    if (!success) {
      return res.status(500).json({ error: "Failed to delete user data" });
    }

    // Also delete from legacy format for completeness
    await saveUserToken(userId, null);

    // Clear the JWT cookie
    res.clearCookie("auth_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    console.log(
      `[Delete Account] Successfully deleted account for user ${userId}`
    );

    res.json({
      success: true,
      message: "Account deleted successfully",
      deleted_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `[Delete Account] Error deleting account for user ${userId}:`,
      error
    );
    res.status(500).json({ error: "Failed to delete account" });
  }
});

/**
 * Future endpoint placeholder: Add custom workout
 * This demonstrates how to extend the system for additional user data
 */
app.post("/user/workouts", authenticateJWT, async (req, res) => {
  const userId = req.user.userId;
  const { name, description, exercises, duration, difficulty } = req.body;

  console.log(`[Add Workout] Adding custom workout for user ${userId}`);

  // This is a placeholder showing how to extend for custom workouts
  // In the future, you would add a new DynamoDB record:
  // PK: USER#{userId}, SK: WORKOUT#{workoutId}

  try {
    // Validate required fields
    if (!name || !exercises || !Array.isArray(exercises)) {
      return res.status(400).json({
        error: "Invalid workout data",
        message: "Name and exercises array are required",
      });
    }

    // For now, just return success with placeholder data
    // In future implementation, save to DynamoDB with new SK pattern
    const workoutId = `workout_${Date.now()}`;
    const workout = {
      id: workoutId,
      name,
      description: description || "",
      exercises,
      duration: duration || 0,
      difficulty: difficulty || "medium",
      created_at: Date.now(),
      user_id: userId,
    };

    res.json({
      success: true,
      message: "Custom workout feature coming soon!",
      placeholder_workout: workout,
      note: "This endpoint demonstrates extensibility - actual workout storage not yet implemented",
    });
  } catch (error) {
    console.error(`[Add Workout] Error for user ${userId}:`, error);
    res.status(500).json({ error: "Failed to add workout" });
  }
});

/**
 * Get user's custom workouts (placeholder)
 */
app.get("/user/workouts", authenticateJWT, async (req, res) => {
  const userId = req.user.userId;

  console.log(`[Get Workouts] Fetching workouts for user ${userId}`);

  // Placeholder for future workout retrieval
  // Would query DynamoDB with: PK = USER#{userId}, SK begins_with WORKOUT#

  res.json({
    success: true,
    workouts: [],
    message: "Custom workouts feature coming soon!",
    note: "This endpoint demonstrates how to extend the system for additional user data",
  });
});

module.exports = app;

// Local mode
if (require.main === module) {
  const PORT = process.env.PORT || 5050;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
