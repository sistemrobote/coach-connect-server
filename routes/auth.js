const express = require("express");
const axios = require("axios");
const { getStravaSecrets } = require("../secrets");
const { createUserJWT, authenticateJWT, optionalAuth } = require("../auth");
const {
  saveUserToken,
  saveUserProfile,
  getUserProfile,
  getUserTokens,
} = require("../users");

const router = express.Router();

/**
 * OAuth token exchange endpoint
 */
router.get("/exchange_token", async (req, res) => {
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
      sameSite: "lax",
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
      message: "Unable to complete Strava authentication",
    });
  }
});

/**
 * Logout endpoint - clears JWT cookie and optionally revokes Strava tokens
 */
router.post("/logout", optionalAuth, async (req, res) => {
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
      sameSite: process.env.NODE_ENV === "lax",
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
router.get("/me", authenticateJWT, async (req, res) => {
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
router.post("/refresh", authenticateJWT, async (req, res) => {
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
      sameSite: "lax",
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

module.exports = router;