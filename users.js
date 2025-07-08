const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(path.join(__dirname, "tokens.db"));

// Create table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      user_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER
    )
  `);
});

module.exports = {
  saveUserToken: (userId, tokens) => {
    const id = String(userId);
    if (tokens == null) {
      db.run(`DELETE FROM user_tokens WHERE user_id = ?`, [id], function (err) {
        if (err) console.log(`[saveUserToken] Error removing user ${id}:`, err);
        else console.log(`[saveUserToken] Removed user ${id}`);
      });
    } else {
      db.run(
        `
        INSERT INTO user_tokens (user_id, access_token, refresh_token, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at
        `,
        [id, tokens.access_token, tokens.refresh_token, tokens.expires_at],
        function (err) {
          if (err)
            console.log(`[saveUserToken] Error storing user ${id}:`, err);
          else console.log(`[saveUserToken] Stored user ${id}`);
        }
      );
    }
  },

  getUserToken: (userId) => {
    const id = String(userId);
    console.log(`[getUserToken] Getting user ${id}`);
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM user_tokens WHERE user_id = ?`,
        [id],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            if (!row) return resolve(null);
            // row: { user_id, access_token, refresh_token, expires_at }
            // to match old API, return just the token fields
            resolve({
              access_token: row.access_token,
              refresh_token: row.refresh_token,
              expires_at: row.expires_at,
            });
          }
        }
      );
    });
  },

  getAllUsers: () => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT user_id FROM user_tokens`, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map((r) => r.user_id));
        }
      });
    });
  },
};
