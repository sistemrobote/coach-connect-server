const cors = require("cors");
const cookieParser = require("cookie-parser");

/**
 * Configure CORS middleware with dynamic origin based on secrets
 */
const configureCors = () => {
  return cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "https://www.hmap.click",
        "http://localhost:5173",
      ];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Allow cookies to be sent
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  });
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
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
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
};

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.path}:`, err);

  // Don't leak error details in production
  if (process.env.NODE_ENV === "production") {
    res.status(500).json({
      error: "Internal server error",
      message: "Something went wrong",
    });
  } else {
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
      stack: err.stack,
    });
  }
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `Route ${req.method} ${req.path} not found`,
  });
};

module.exports = {
  configureCors,
  securityHeaders,
  requestLogger,
  errorHandler,
  notFoundHandler,
  cookieParser: cookieParser(),
};
