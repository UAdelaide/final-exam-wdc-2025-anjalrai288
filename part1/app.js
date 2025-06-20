var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

let db;

(async () => {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '' // your mysql root password
        });

        await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
        await connection.end();

        db = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'DogWalkService',
            multipleStatements: true
        });

        console.log('Connected to DogWalkService.');

        // Create tables
        await db.execute(`
            CREATE TABLE IF NOT EXISTS Users (
                user_id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('owner', 'walker') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS Dogs (
                dog_id INT AUTO_INCREMENT PRIMARY KEY,
                owner_id INT NOT NULL,
                name VARCHAR(50) NOT NULL,
                size ENUM('small', 'medium', 'large') NOT NULL,
                FOREIGN KEY (owner_id) REFERENCES Users(user_id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS WalkRequests (
                request_id INT AUTO_INCREMENT PRIMARY KEY,
                dog_id INT NOT NULL,
                requested_time DATETIME NOT NULL,
                duration_minutes INT NOT NULL,
                location VARCHAR(255) NOT NULL,
                status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            INSERT INTO Users (username, email, password_hash, role) VALUES
            ('alice123', 'alice@example.com', 'hashed123', 'owner'),
            ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
            ('carol123', 'carol@example.com', 'hashed789', 'owner'),
            ('ghjb456', 'ghjb@example.com', 'hashed109', 'walker'),
            ('dcs321', 'dcs@example.com', 'hashed202', 'owner');
        `);

        // Insert dogs (only Max and Bella for sample output)
        await db.execute(`
            INSERT INTO Dogs (owner_id, name, size) VALUES
((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
((SELECT user_id FROM Users WHERE username = 'carol123'), 'Cha', 'large'),
((SELECT user_id FROM Users WHERE username = 'alice123'), 'Ram', 'small'),
((SELECT user_id FROM Users WHERE username = 'carol123'), 'Rai', 'medium');
        `);

        // Insert walk requests (only one open for sample)
        await db.execute(`
            INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
            VALUES
            (
                (SELECT dog_id FROM Dogs WHERE name = 'Max'),
                '2025-06-10 08:00:00',
                30,
                'Parklands',
                'open'
            ),
            (
                (SELECT dog_id FROM Dogs WHERE name = 'Bella'),
                '2025-06-10 09:30:00',
                45,
                'Beachside Ave',
                'completed'
            )
        `);

        // Insert walk applications (bobwalker accepted Bella's walk)
        await db.execute(`
            INSERT INTO WalkApplications (request_id, walker_id, status)
            VALUES
            (
                (SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Bella')),
                (SELECT user_id FROM Users WHERE username = 'bobwalker'),
                'accepted'
            )
        `);

        // Insert walk ratings (bobwalker rated for Bella's walk)
        await db.execute(`
            INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
            VALUES
            (
                (SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Bella')),
                (SELECT user_id FROM Users WHERE username = 'bobwalker'),
                (SELECT user_id FROM Users WHERE username = 'carol123'),
                5,
                'Bobwalker was excellent with Bella!'
            )
        `);

        // Insert another completed walk and rating to get average 4.5 for bobwalker with 2 completed walks
        await db.execute(`
            INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
            VALUES
            (
                (SELECT dog_id FROM Dogs WHERE name = 'Max'),
                '2025-06-11 10:00:00',
                25,
                'City Park',
                'completed'
            )
        `);

        await db.execute(`
            INSERT INTO WalkApplications (request_id, walker_id, status)
            VALUES
            (
                (SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Max') AND status = 'completed' ORDER BY request_id DESC LIMIT 1),
                (SELECT user_id FROM Users WHERE username = 'bobwalker'),
                'accepted'
            )
        `);

        await db.execute(`
            INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
            VALUES
            (
                (SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Max') AND status = 'completed' ORDER BY request_id DESC LIMIT 1),
                (SELECT user_id FROM Users WHERE username = 'bobwalker'),
                (SELECT user_id FROM Users WHERE username = 'alice123'),
                4,
                'Good walk with Max.'
            )
        `);

        console.log('Sample data inserted.');

    } catch (err) {
        console.error('Error setting up database:', err);
    }
})();

// Routes

// /api/dogs
app.get('/api/dogs', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT d.name AS dog_name, d.size, u.username AS owner_username
            FROM Dogs d
            JOIN Users u ON d.owner_id = u.user_id
            WHERE u.role = 'owner'
            ORDER BY d.name ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// /api/walkrequests/open
app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                wr.request_id,
                d.name AS dog_name,
                wr.requested_time,
                wr.duration_minutes,
                wr.location,
                u.username AS owner_username
            FROM WalkRequests wr
            JOIN Dogs d ON wr.dog_id = d.dog_id
            JOIN Users u ON d.owner_id = u.user_id
            WHERE wr.status = 'open'
            ORDER BY wr.requested_time ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// /api/walkers/summary
app.get('/api/walkers/summary', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                u.username AS walker_username,
                COUNT(DISTINCT wq.request_id) AS completed_walks,
                COUNT(wrat.rating_id) AS total_ratings,
                AVG(wrat.rating) AS average_rating
            FROM Users u
            LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id AND wa.status = 'accepted'
            LEFT JOIN WalkRequests wq ON wa.request_id = wq.request_id AND wq.status = 'completed'
            LEFT JOIN WalkRatings wrat ON wrat.request_id = wq.request_id AND u.user_id = wrat.walker_id
            WHERE u.role = 'walker'
            GROUP BY u.user_id
            ORDER BY u.username
        `);

        // Format average_rating: null if no ratings, else one decimal float
        const formattedRows = rows.map(row => {
            return {
                walker_username: row.walker_username,
                total_ratings: row.total_ratings,
                average_rating: row.total_ratings > 0 ? parseFloat(row.average_rating.toFixed(1)) : null,
                completed_walks: row.completed_walks
            };
        });

        res.json(formattedRows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;
