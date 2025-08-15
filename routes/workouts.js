const express = require("express");
const { authenticateJWT } = require("../auth");
const { saveWorkout, getUserWorkouts, deleteUserWorkout } = require("../users");

const router = express.Router();

/**
 * Add custom workout for user
 */
router.post("/", authenticateJWT, async (req, res) => {
  const userId = req.user.userId;
  const { name, description, duration, difficulty, count, date } = req.body;

  console.log(`[Add Workout] Adding custom workout for user ${userId}`);

  try {
    // Validate required fields
    if (!name) {
      return res.status(400).json({
        error: "Invalid workout data",
        message: "Name is required",
      });
    }

    // Validate difficulty if provided
    const validDifficulties = ["easy", "medium", "hard"];
    if (difficulty && !validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        error: "Invalid workout data",
        message: "Difficulty must be one of: easy, medium, hard",
      });
    }

    // Validate and parse date if provided
    let workoutDate = Date.now(); // Default to current time
    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          error: "Invalid workout data",
          message: "Date must be a valid ISO date string",
        });
      }
      workoutDate = parsedDate.getTime();
    }

    // Save workout to database
    const workout = await saveWorkout(userId, {
      name,
      description,
      duration: duration || 0,
      difficulty: difficulty || "medium",
      count: count || 0,
      workoutDate,
    });

    if (!workout) {
      return res.status(500).json({
        error: "Failed to save workout",
        message: "Unable to store workout in database",
      });
    }

    res.status(201).json({
      success: true,
      message: "Workout created successfully",
      workout,
    });
  } catch (error) {
    console.error(`[Add Workout] Error for user ${userId}:`, error);
    res.status(500).json({ error: "Failed to add workout" });
  }
});

/**
 * Get user's custom workouts
 */
router.get("/", authenticateJWT, async (req, res) => {
  const userId = req.user.userId;

  console.log(`[Get Workouts] Fetching workouts for user ${userId}`);

  try {
    const workouts = await getUserWorkouts(userId);

    res.json({
      success: true,
      count: workouts.length,
      workouts,
    });
  } catch (error) {
    console.error(`[Get Workouts] Error for user ${userId}:`, error);
    res.status(500).json({ error: "Failed to fetch workouts" });
  }
});

/**
 * Delete a specific workout
 */
router.delete("/:workoutId", authenticateJWT, async (req, res) => {
  const userId = req.user.userId;
  const { workoutId } = req.params;

  console.log(
    `[Delete Workout] Deleting workout ${workoutId} for user ${userId}`
  );

  try {
    if (!workoutId) {
      return res.status(400).json({
        error: "Invalid request",
        message: "Workout ID is required",
      });
    }

    const success = await deleteUserWorkout(userId, workoutId);

    if (!success) {
      return res.status(404).json({
        error: "Workout not found",
        message: "Unable to find or delete the specified workout",
      });
    }

    res.json({
      success: true,
      message: "Workout deleted successfully",
      deleted_workout_id: workoutId,
    });
  } catch (error) {
    console.error(`[Delete Workout] Error for user ${userId}:`, error);
    res.status(500).json({ error: "Failed to delete workout" });
  }
});

module.exports = router;
