const jwt = require("jsonwebtoken");

// JWT Configuration
const JWT_CONFIG = {
  expiresIn: "24h", // Token expires in 24 hours
  issuer: "strava-connect", // Who issued the token
  audience: "strava-app", // Who the token is for
};

// Get JWT secret from environment or use default for development
const getJWTSecret = () => {
  // In production, this should be a strong, randomly generated secret
  // For development, we'll use a default (you should change this)
  return (
    process.env.JWT_SECRET || "super-secret-jwt-key-change-this-in-production"
  );
};

/**
 * Creates a JWT token for a user after successful Strava OAuth
 * @param {Object} stravaUser - User data from Strava OAuth response
 * @param {Object} tokens - OAuth tokens from Strava
 * @returns {string} JWT token
 */
const createUserJWT = (stravaUser, tokens) => {
  console.log(`[createUserJWT] Creating JWT for user ${stravaUser.id}`);

  // Payload contains non-sensitive user information
  const payload = {
    // User identification
    userId: stravaUser.id,
    stravaId: stravaUser.id,

    // Basic profile info (safe to include in JWT)
    username: stravaUser.username || `athlete_${stravaUser.id}`,
    firstname: stravaUser.firstname,
    lastname: stravaUser.lastname,

    // Token scope and metadata
    scope: tokens.scope || "read",
    tokenIssuedAt: Date.now(),

    // App-specific data
    appRole: "user",
    features: ["strava_sync", "activities_view"],
  };

  try {
    const token = jwt.sign(payload, getJWTSecret(), JWT_CONFIG);
    console.log(
      `[createUserJWT] JWT created successfully for user ${stravaUser.id}`
    );
    return token;
  } catch (error) {
    console.error("[createUserJWT] Error creating JWT:", error);
    throw new Error("Failed to create authentication token");
  }
};

/**
 * Verifies and decodes a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded payload or null if invalid
 */
const verifyJWT = (token) => {
  try {
    const decoded = jwt.verify(token, getJWTSecret(), {
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    });

    console.log(`[verifyJWT] Token verified for user ${decoded.userId}`);
    return decoded;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      console.log("[verifyJWT] Token expired");
    } else if (error.name === "JsonWebTokenError") {
      console.log("[verifyJWT] Invalid token");
    } else {
      console.error("[verifyJWT] Token verification error:", error.message);
    }
    return null;
  }
};

/**
 * Express middleware to authenticate requests using JWT
 * Checks for JWT in cookies or Authorization header
 */
const authenticateJWT = (req, res, next) => {
  let token = null;

  // Debug: Log all cookies and headers
  console.log("[authenticateJWT] All cookies:", req.cookies);
  console.log("[authenticateJWT] Authorization header:", req.headers.authorization);
  console.log("[authenticateJWT] Origin:", req.headers.origin);

  // Try to get token from cookie first (more secure)
  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
    console.log("[authenticateJWT] Token found in cookie");
  }

  // Fallback to Authorization header (for API clients)
  else if (req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
      console.log("[authenticateJWT] Token found in Authorization header");
    }
  }

  if (!token) {
    console.log("[authenticateJWT] No token provided");
    return res.status(401).json({
      error: "Authentication required",
      message: "No authentication token provided",
    });
  }

  // Verify the token
  const decoded = verifyJWT(token);
  if (!decoded) {
    return res.status(401).json({
      error: "Invalid token",
      message: "Authentication token is invalid or expired",
    });
  }

  // Add user info to request object for use in route handlers
  req.user = {
    userId: decoded.userId,
    stravaId: decoded.stravaId,
    username: decoded.username,
    firstname: decoded.firstname,
    lastname: decoded.lastname,
    scope: decoded.scope,
    appRole: decoded.appRole,
    features: decoded.features || [],
  };

  console.log(
    `[authenticateJWT] User ${decoded.userId} authenticated successfully`
  );
  next();
};

/**
 * Optional authentication middleware - doesn't fail if no token
 * Useful for endpoints that work for both authenticated and anonymous users
 */
const optionalAuth = (req, res, next) => {
  let token = null;

  // Try to get token (same logic as authenticateJWT)
  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.substring(7);
  }

  if (token) {
    const decoded = verifyJWT(token);
    if (decoded) {
      req.user = {
        userId: decoded.userId,
        stravaId: decoded.stravaId,
        username: decoded.username,
        firstname: decoded.firstname,
        lastname: decoded.lastname,
        scope: decoded.scope,
        appRole: decoded.appRole,
        features: decoded.features || [],
      };
      console.log(`[optionalAuth] User ${decoded.userId} authenticated`);
    }
  }

  // Continue regardless of authentication status
  next();
};

module.exports = {
  createUserJWT,
  verifyJWT,
  authenticateJWT,
  optionalAuth,
  JWT_CONFIG,
};
