const express = require('express');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const mysql = require('mysql2/promise');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

let db;

(async function connectToDatabase() {
  try {
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

    console.log('✅ Connected to DogWalkService database.');

    // Optional: Insert demo users if needed
    const [users] = await db.execute('SELECT COUNT(*) AS count FROM Users');
    if (users[0].count === 0) {
      await db.execute(`
        INSERT INTO Users (username, email, password_hash, role) VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('ghjb456', 'ghjb@example.com', 'hashed109', 'walker'),
        ('dcs', 'dcs@example.com', 'hashed202', 'owner')
      `);
      console.log('Inserted sample users.');
    }

    // Optional: Insert dogs if needed
    const [dogs] = await db.execute('SELECT COUNT(*) AS count FROM Dogs');
    if (dogs[0].count === 0) {
      await db.execute(`
        INSERT INTO Dogs (owner_id, name, size) VALUES
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Cha', 'large'),
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Ram', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Rai', 'medium')
      `);
      console.log('Inserted sample dogs.');
    }

    const [walks] = await db.execute('SELECT COUNT(*) AS count FROM WalkRequests');
    if (walks[0].count === 0) {
      await db.execute(`
        INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES
        ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Cha'), '2025-06-11 10:00:00', 60, 'City Park', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Ram'), '2025-06-12 07:45:00', 25, 'Riverfront Trail', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Rai'), '2025-06-13 18:00:00', 40, 'Hillside Path', 'cancelled')
      `);
      console.log('Inserted sample walk requests.');
    }

  } catch (err) {
    console.error('❌ Failed to connect or setup database:', err.message);
  }
})();

// === ROUTES ===

// Get all dogs and their owners
app.get('/api/dogs', async (req, res) => {
  try {
    const [data] = await db.execute(`
      SELECT d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
      WHERE u.role = 'owner'
    `);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve dogs' });
  }
});

// Get all open walk requests
app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [data] = await db.execute(`
      SELECT wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location, u.username AS owner_username
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      JOIN Users u ON d.owner_id = u.user_id
      WHERE wr.status = 'open'
    `);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch walk requests' });
  }
});

// Summary of walkers
app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        u.username AS walker_username,
        COUNT(DISTINCT wr.request_id) AS completed_walks,
        COALESCE(AVG(wr.rating), 0.0) AS average_rating,
        COUNT(wr.rating_id) AS total_ratings
      FROM Users u
      LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id AND wa.status = 'accepted'
      LEFT JOIN WalkRequests wq ON wa.request_id = wq.request_id AND wq.status = 'completed'
      LEFT JOIN WalkRatings wr ON wr.request_id = wq.request_id AND wr.walker_id = u.user_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id
      ORDER BY u.username
    `);

    const output = rows.map(row => ({
      walker_username: row.walker_username,
      completed_walks: row.completed_walks,
      average_rating: row.total_ratings > 0 ? parseFloat(row.average_rating).toFixed(1) : null,
      total_ratings: row.total_ratings
    }));

    res.json(output);
  } catch (error) {
    res.status(500).json({ error: 'Could not generate walker summary' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;
