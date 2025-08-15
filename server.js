require("dotenv").config();
const express = require("express");
const { getStravaSecrets } = require("./secrets");
const {
  configureCors,
  securityHeaders,
  requestLogger,
  errorHandler,
  notFoundHandler,
  cookieParser,
} = require("./middleware");

// Import route modules
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const workoutRoutes = require("./routes/workouts");
const stravaRoutes = require("./routes/strava");

const app = express();

// Apply middleware
app.use(configureCors());
app.use(express.json());
app.use(cookieParser);
app.use(securityHeaders);

// Add request logging in development
if (process.env.NODE_ENV !== "production") {
  app.use(requestLogger);
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Test endpoint for configuration validation
app.get("/test", async (req, res) => {
  try {
    const secrets = await getStravaSecrets();
    res.status(200).json({
      TEST: "WORKs",
      STRAVA_CLIENT_ID: secrets.STRAVA_CLIENT_ID,
      STRAVA_CLIENT_SECRET: secrets.STRAVA_CLIENT_SECRET,
      REDIRECT_URI: secrets.REDIRECT_URI,
    });
  } catch (err) {
    console.error("❌ Error in /test:", err);
    res.status(500).json({ error: "Failed to fetch secrets" });
  }
});

// Route registration
app.use("/auth", authRoutes);
app.use("/user/workouts", workoutRoutes); // Mount workouts first
app.use("/user", userRoutes);

// Strava API endpoints at root level for backward compatibility
app.use("/", stravaRoutes);

// Error handling - must be after all routes
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

// Local mode
if (require.main === module) {
  const PORT = process.env.PORT || 5050;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
  });
}
