const express = require("express");
const axios = require("axios");
const { authenticateJWT } = require("../auth");
const {
  saveUserToken,
  getUserProfile,
  updateUserProfile,
  getUserTokens,
} = require("../users");

const router = express.Router();

/**
 * Update user profile preferences and settings
 */
router.put("/profile", authenticateJWT, async (req, res) => {
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
router.get("/profile", authenticateJWT, async (req, res) => {
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
router.delete("/account", authenticateJWT, async (req, res) => {
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
    const { deleteUserData } = require("../users");
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
      sameSite: "lax",
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

module.exports = router;