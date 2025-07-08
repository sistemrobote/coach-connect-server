const {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  ScanCommand,
} = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const TABLE_NAME = "user_tokens";

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
          TableName: TABLE_NAME,
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
    TableName: TABLE_NAME,
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
    TableName: TABLE_NAME,
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
    TableName: TABLE_NAME,
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

module.exports = {
  saveUserToken,
  getUserToken,
  getAllUsers,
};
