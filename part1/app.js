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

let database;

(async function initializeDatabase() {
  try {
    const initialConn = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: ''
    });

    await initialConn.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await initialConn.end();

    database = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

    console.log('Database connection established.');

    await database.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner', 'walker') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS Dogs (
        dog_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        size ENUM('small', 'medium', 'large') NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(user_id)
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS WalkRequests (
        request_id INT AUTO_INCREMENT PRIMARY KEY,
        dog_id INT NOT NULL,
        requested_time DATETIME NOT NULL,
        duration_minutes INT NOT NULL,
        location VARCHAR(255) NOT NULL,
        status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS WalkApplications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        walker_id INT NOT NULL,
        request_id INT NOT NULL,
        status ENUM('pending', 'accepted', 'rejected') NOT NULL
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS WalkRatings (
        rating_id INT AUTO_INCREMENT PRIMARY KEY,
        walker_id INT NOT NULL,
        request_id INT NOT NULL,
        rating INT CHECK (rating BETWEEN 1 AND 5)
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS books (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255),
        author VARCHAR(255)
      )
    `);

    const [userRows] = await database.query('SELECT COUNT(*) AS total FROM Users');
    if (userRows[0].total === 0) {
      await database.query(`
        INSERT INTO Users (username, email, password_hash, role)
        VALUES
          ('alice123', 'alice@example.com', 'hashed123', 'owner'),
          ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
          ('carol123', 'carol@example.com', 'hashed789', 'owner'),
          ('ghjb456', 'ghjb@example.com', 'hashed109', 'walker'),
          ('dcs', 'dcs@example.com', 'hashed202', 'owner')
      `);
    }

    const [dogRows] = await database.query('SELECT COUNT(*) AS total FROM Dogs');
    if (dogRows[0].total === 0) {
      await database.query(`
        INSERT INTO Dogs (owner_id, name, size)
        VALUES
          ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
          ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
          ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Cha', 'large'),
          ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Ram', 'small'),
          ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Rai', 'medium')
      `);
    }

    const [walkRows] = await database.query('SELECT COUNT(*) AS total FROM WalkRequests');
    if (walkRows[0].total === 0) {
      await database.query(`
        INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
        VALUES
          ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
          ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
          ((SELECT dog_id FROM Dogs WHERE name = 'Cha'), '2025-06-11 10:00:00', 60, 'City Park', 'open'),
          ((SELECT dog_id FROM Dogs WHERE name = 'Ram'), '2025-06-12 07:45:00', 25, 'Riverfront Trail', 'open'),
          ((SELECT dog_id FROM Dogs WHERE name = 'Rai'), '2025-06-13 18:00:00', 40, 'Hillside Path', 'cancelled')
      `);
    }

    const [bookRows] = await database.query('SELECT COUNT(*) AS total FROM books');
    if (bookRows[0].total === 0) {
      await database.query(`
        INSERT INTO books (title, author)
        VALUES
          ('1984', 'George Orwell'),
          ('To Kill a Mockingbird', 'Harper Lee'),
          ('Brave New World', 'Aldous Huxley')
      `);
    }
  } catch (error) {
    console.error('DB Setup Error — Check if MySQL is running:', error);
  }
})();

// ROUTES

app.get('/', async (req, res) => {
  try {
    const [results] = await database.query('SELECT * FROM books');
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching book data' });
  }
});

app.get('/api/dogs', async (req, res) => {
  try {
    const [data] = await database.query(`
      SELECT d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d
      INNER JOIN Users u ON d.owner_id = u.user_id
      WHERE u.role = 'owner'
    `);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Unable to retrieve dog data' });
  }
});

app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [data] = await database.query(`
      SELECT wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location, u.username AS owner_username
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      JOIN Users u ON d.owner_id = u.user_id
      WHERE wr.status = 'open'
    `);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch walk requests' });
  }
});

app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [result] = await database.query(`
      SELECT
        u.username AS walker_username,
        COUNT(DISTINCT wr.request_id) AS completed_walks,
        COALESCE(AVG(wrat.rating), 0.0) AS average_rating,
        COUNT(wrat.rating_id) AS total_ratings
      FROM Users u
      LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id AND wa.status = 'accepted'
      LEFT JOIN WalkRequests wr ON wa.request_id = wr.request_id AND wr.status = 'completed'
      LEFT JOIN WalkRatings wrat ON wr.request_id = wrat.request_id AND u.user_id = wrat.walker_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id
      ORDER BY u.username
    `);

    const transformed = result.map(entry => ({
      walker_username: entry.walker_username,
      total_ratings: entry.total_ratings,
      average_rating: entry.total_ratings > 0 ? parseFloat(entry.average_rating).toFixed(1) : null,
      completed_walks: entry.completed_walks
    }));

    res.json(transformed);
  } catch (error) {
    res.status(500).json({ error: 'Walker summary fetch failed' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;
