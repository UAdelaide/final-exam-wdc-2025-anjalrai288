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
            password: ''
        });

        await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
        await connection.end();

        db = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'DogWalkService'
        });

        console.log('Connected to DogWalkService.');

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
                FOREIGN KEY (owner_id) REFERENCES Users(user_id)
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
                FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
            )
        `);

    } catch (err) {
    console.error('Error setting up database. Ensure MySQL is running: service mysql start', err);
}
})();


app.get('/api/dogs', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                d.name AS dog_name, d.size, u.username AS owner_username
            FROM Dogs d
            JOIN Users u ON d.owner_id = u.user_id
            WHERE u.role = 'owner'
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location, u.username AS owner_username
            FROM WalkRequests wr
            JOIN Dogs d ON wr.dog_id = d.dog_id
            JOIN Users u ON d.owner_id = u.user_id
            WHERE wr.status = 'open'
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location, u.username AS owner_username
            FROM WalkRequests wr
            JOIN Dogs d ON wr.dog_id = d.dog_id
            JOIN Users u ON d.owner_id = u.user_id
            WHERE wr.status = 'open'
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// Get walker summary: username, completed walks, average rating, total ratings
app.get('/api/walkers/summary', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT u.username AS walker_username,
                   COUNT(DISTINCT wq.request_id) AS completed_walks,
                   COALESCE(AVG(wrat.rating), 0.0) AS average_rating,
                   COUNT(wrat.rating_id) AS total_ratings
            FROM Users u
            LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id AND wa.status = 'accepted'
            LEFT JOIN WalkRequests wq ON wa.request_id = wq.request_id AND wq.status = 'completed'
            LEFT JOIN WalkRatings wrat ON wrat.request_id = wq.request_id AND u.user_id = wrat.walker_id
            WHERE u.role = 'walker'
            GROUP BY u.user_id
            ORDER BY u.username
        `);

        const formattedRows = rows.map(row => {
            const avg = parseFloat(row.average_rating);
            return {
                walker_username: row.walker_username,
                completed_walks: row.completed_walks,
                average_rating: row.total_ratings > 0 && !isNaN(avg) ? avg.toFixed(1) : null,
                total_ratings: row.total_ratings
            };
        });

        res.json(formattedRows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;