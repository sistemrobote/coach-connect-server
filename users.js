const {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  ScanCommand,
  QueryCommand,
} = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const TABLE_NAME = "user_profiles"; // Updated to use new table with composite keys
const LEGACY_TABLE_NAME = "user_tokens"; // Keep reference to legacy table

// Helper function to convert JavaScript objects to DynamoDB format
const toDynamoDBItem = (obj) => {
  const item = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string") {
      item[key] = { S: value };
    } else if (typeof value === "number") {
      item[key] = { N: String(value) };
    } else if (typeof value === "boolean") {
      item[key] = { BOOL: value };
    } else if (typeof value === "object") {
      item[key] = { S: JSON.stringify(value) };
    }
  }
  return item;
};

// Helper function to convert DynamoDB items to JavaScript objects
const fromDynamoDBItem = (item) => {
  const obj = {};
  for (const [key, value] of Object.entries(item)) {
    if (value.S !== undefined) {
      // Try to parse JSON strings back to objects
      if (key === "profile" || key === "preferences" || key === "metadata") {
        try {
          obj[key] = JSON.parse(value.S);
        } catch {
          obj[key] = value.S;
        }
      } else {
        obj[key] = value.S;
      }
    } else if (value.N !== undefined) {
      obj[key] = Number(value.N);
    } else if (value.BOOL !== undefined) {
      obj[key] = value.BOOL;
    }
  }
  return obj;
};

/**
 * Save or update a user's tokens. If tokens is null, remove the user.
 */
const saveUserToken = async (userId, tokens) => {
  const id = String(userId);

  if (tokens == null) {
    // Delete user
    try {
      await client.send(
        new DeleteItemCommand({
          TableName: LEGACY_TABLE_NAME,
          Key: { user_id: { S: id } },
        })
      );
      console.log(`[saveUserToken] Removed user ${id}`);
    } catch (err) {
      console.log(`[saveUserToken] Error removing user ${id}:`, err);
    }
    return;
  }

  // Put (upsert) user
  const params = {
    TableName: LEGACY_TABLE_NAME,
    Item: {
      user_id: { S: id },
      access_token: { S: tokens.access_token },
      refresh_token: { S: tokens.refresh_token },
      expires_at: { N: String(tokens.expires_at) },
    },
  };
  try {
    await client.send(new PutItemCommand(params));
    console.log(`[saveUserToken] Stored user ${id}`);
  } catch (err) {
    console.log(`[saveUserToken] Error storing user ${id}:`, err);
  }
};

/**
 * Get a user's tokens by userId.
 * Returns { access_token, refresh_token, expires_at } or null if not found.
 */
const getUserToken = async (userId) => {
  const id = String(userId);
  console.log(`[getUserToken] Getting user ${id}`);
  const params = {
    TableName: LEGACY_TABLE_NAME,
    Key: { user_id: { S: id } },
  };

  try {
    const { Item } = await client.send(new GetItemCommand(params));
    if (!Item) return null;
    return {
      access_token: Item.access_token.S,
      refresh_token: Item.refresh_token.S,
      expires_at: Number(Item.expires_at.N),
    };
  } catch (err) {
    console.log(`[getUserToken] Error getting user ${id}:`, err);
    return null;
  }
};

/**
 * Get a list of all user_ids in the table.
 * Returns an array of user_id strings.
 */
const getAllUsers = async () => {
  const params = {
    TableName: LEGACY_TABLE_NAME,
    ProjectionExpression: "user_id",
  };
  try {
    const result = await client.send(new ScanCommand(params));
    return (result.Items || []).map((item) => item.user_id.S);
  } catch (err) {
    console.log("[getAllUsers] Error scanning users:", err);
    return [];
  }
};

/**
 * Enhanced user profile management using single-table design
 * PK = USER#{userId}, SK = PROFILE for user profile data
 * PK = USER#{userId}, SK = TOKENS#STRAVA for Strava tokens
 */

/**
 * Save complete user profile including Strava data and tokens
 * @param {string} userId - Strava user ID
 * @param {Object} stravaUser - Strava user profile data
 * @param {Object} tokens - Strava OAuth tokens
 * @param {Object} additionalData - Additional user preferences/metadata
 */
const saveUserProfile = async (
  userId,
  stravaUser,
  tokens,
  additionalData = {}
) => {
  const id = String(userId);
  const now = Date.now();

  try {
    // Save user profile data
    const profileData = {
      PK: `USER#${id}`,
      SK: "PROFILE",
      entity_type: "USER_PROFILE",
      user_id: id,

      // Strava profile information
      profile: {
        id: stravaUser.id,
        username: stravaUser.username,
        firstname: stravaUser.firstname,
        lastname: stravaUser.lastname,
        city: stravaUser.city,
        state: stravaUser.state,
        country: stravaUser.country,
        sex: stravaUser.sex,
        premium: stravaUser.premium || false,
        summit: stravaUser.summit || false,
        profile: stravaUser.profile, // Avatar URL
        profile_medium: stravaUser.profile_medium,
        created_at: stravaUser.created_at,
        updated_at: stravaUser.updated_at,
      },

      // App-specific data
      preferences: additionalData.preferences || {},
      settings: additionalData.settings || {},
      subscription_tier: additionalData.subscription_tier || "free",

      // Timestamps
      created_at: additionalData.created_at || now,
      updated_at: now,
      last_login: now,
    };

    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: toDynamoDBItem(profileData),
      })
    );

    // Save tokens separately for security
    const tokenData = {
      PK: `USER#${id}`,
      SK: "TOKENS#STRAVA",
      entity_type: "USER_TOKENS",
      user_id: id,

      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      scope: tokens.scope || "read",
      token_type: tokens.token_type || "Bearer",

      created_at: now,
      updated_at: now,
    };

    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: toDynamoDBItem(tokenData),
      })
    );

    console.log(`[saveUserProfile] Saved complete profile for user ${id}`);
    return true;
  } catch (error) {
    console.error(
      `[saveUserProfile] Error saving profile for user ${id}:`,
      error
    );
    throw error;
  }
};

/**
 * Get user profile data (without sensitive tokens)
 * @param {string} userId - User ID
 * @returns {Object|null} User profile or null if not found
 */
const getUserProfile = async (userId) => {
  const id = String(userId);

  try {
    const { Item } = await client.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: { S: `USER#${id}` },
          SK: { S: "PROFILE" },
        },
      })
    );

    if (!Item) {
      console.log(`[getUserProfile] Profile not found for user ${id}`);
      return null;
    }

    const profile = fromDynamoDBItem(Item);
    console.log(`[getUserProfile] Retrieved profile for user ${id}`);
    return profile;
  } catch (error) {
    console.error(
      `[getUserProfile] Error getting profile for user ${id}:`,
      error
    );
    return null;
  }
};

/**
 * Get user tokens for Strava API calls
 * @param {string} userId - User ID
 * @returns {Object|null} Token data or null if not found
 */
const getUserTokens = async (userId) => {
  const id = String(userId);

  try {
    const { Item } = await client.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: { S: `USER#${id}` },
          SK: { S: "TOKENS#STRAVA" },
        },
      })
    );

    if (!Item) {
      console.log(`[getUserTokens] Tokens not found for user ${id}`);
      return null;
    }

    const tokens = fromDynamoDBItem(Item);
    console.log(`[getUserTokens] Retrieved tokens for user ${id}`);
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      scope: tokens.scope,
      token_type: tokens.token_type,
    };
  } catch (error) {
    console.error(
      `[getUserTokens] Error getting tokens for user ${id}:`,
      error
    );
    return null;
  }
};

/**
 * Update user preferences and settings
 * @param {string} userId - User ID
 * @param {Object} updates - Data to update
 * @returns {boolean} Success status
 */
const updateUserProfile = async (userId, updates) => {
  const id = String(userId);

  try {
    // First get the existing profile
    const existingProfile = await getUserProfile(id);
    if (!existingProfile) {
      console.log(`[updateUserProfile] Profile not found for user ${id}`);
      return false;
    }

    // Merge updates with existing data
    const updatedProfile = {
      ...existingProfile,
      ...updates,
      updated_at: Date.now(),
    };

    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: toDynamoDBItem(updatedProfile),
      })
    );

    console.log(`[updateUserProfile] Updated profile for user ${id}`);
    return true;
  } catch (error) {
    console.error(
      `[updateUserProfile] Error updating profile for user ${id}:`,
      error
    );
    return false;
  }
};

/**
 * Delete all user data (profile and tokens)
 * @param {string} userId - User ID
 * @returns {boolean} Success status
 */
const deleteUserData = async (userId) => {
  const id = String(userId);

  try {
    // Delete profile
    await client.send(
      new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: { S: `USER#${id}` },
          SK: { S: "PROFILE" },
        },
      })
    );

    // Delete tokens
    await client.send(
      new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: { S: `USER#${id}` },
          SK: { S: "TOKENS#STRAVA" },
        },
      })
    );

    console.log(`[deleteUserData] Deleted all data for user ${id}`);
    return true;
  } catch (error) {
    console.error(
      `[deleteUserData] Error deleting data for user ${id}:`,
      error
    );
    return false;
  }
};

module.exports = {
  // Legacy functions (keep for backward compatibility)
  saveUserToken,
  getUserToken,
  getAllUsers,

  // New enhanced functions
  saveUserProfile,
  getUserProfile,
  getUserTokens,
  updateUserProfile,
  deleteUserData,

  // Helper functions
  toDynamoDBItem,
  fromDynamoDBItem,
};
