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
        // Connect to MySQL without specifying a database
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '' // Set your MySQL root password
        });

        // Create the database if it doesn't exist
        await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
        await connection.end();

        // Now connect to the created database
        db = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'DogWalkService'
        });

        console.log('Connected to DogWalkService.');

        await db.beginTransaction();
        try {
            await db.execute('SET FOREIGN_KEY_CHECK_CHECKS = 0;');
            await db.execute('TRUNCATE TABLE WalkRatings;');
            await db.execute('TRUNCATE TABLE WalkRequests;');
            await db.execute('TRUNCATE TABLE Dogs;');
            await db.execute('TRUNCATE TABLE Users;');
            await db.execute('SET FOREIGN_KEY_CHECK_CHECKS = 1;');
            await db.execute('TRUNCATE TABLE WalkRatings;');
            console.log('Existing DogWalkService data cleared (if any).');

            await db.execute(`
                INSERT INTO Users (username, email, password_hash, role)
                VALUES
                ('alice123', 'alice@example.com', 'hashed123', 'owner'),
                ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
                ('carol123', 'carol@example.com', 'hashed789', 'owner'),
                ('ghjb456', 'ghjb@example.com', 'hashed109', 'walker'),
                ('dcs', 'dcs@example.com', 'hashed202', 'owner');
            `);
            console.log('Users inserted.');

            await db.execute(`
                INSERT INTO Dogs (owner_id, name, size)
                VALUES
                ((SELECT user_id FROM Users WHERE username = 'alice123' AND role = 'owner'), 'Max', 'medium'),
                ((SELECT user_id FROM Users WHERE username = 'carol123' AND role = 'owner'), 'Bella', 'small'),
                ((SELECT user_id FROM Users WHERE username = 'carol123' AND role = 'owner'), 'Cha', 'large'),
                ((SELECT user_id FROM Users WHERE username = 'alice123' AND role = 'owner'), 'Ram', 'small'),
                ((SELECT user_id FROM Users WHERE username = 'carol123' AND role = 'owner'), 'Rai', 'medium');
            `);
            console.log('Dogs inserted.');

            await db.execute(`
                INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
                VALUES
                ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
                ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
                ((SELECT dog_id FROM Dogs WHERE name = 'Cha'), '2025-06-11 10:00:00', 60, 'City Park', 'open'),
                ((SELECT dog_id FROM Dogs WHERE name = 'Ram'), '2025-06-12 07:45:00', 25, 'Riverfront Trail', 'open'),
                ((SELECT dog_id FROM Dogs WHERE name = 'Rai'), '2025-06-13 18:00:00', 40, 'Hillside Path', 'cancelled');
            `);
            console.log('WalkRequests inserted.');
        }
    } catch (err) {
        console.error('Error setting up database. Ensure Mysql is running: service mysql start', err);
    }
})();

app.get('/api/dogs', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                d.name AS dog_name, d.size, u.username AS owner_username
            FROM Dogs d
            JOIN Users u ON d.owner_id = u.user_id
            WHERE u.role = 'owner'; -- Ensure only owners are linked
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching dogs:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location, u.username AS owner_username
            FROM
                WalkRequests wr
            JOIN
                Dogs d ON wr.dog_id = d.dog_id
            JOIN
                Users u ON d.owner_id = u.user_id
            WHERE
                wr.status = 'open';
        `);
        res.json(rows); // Return as JSON
    } catch (error) {
        console.error('Error fetching open walk requests:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});














      // Create a table if it doesn't exist
      await db.execute(`
        CREATE TABLE IF NOT EXISTS books (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255),
          author VARCHAR(255)
        )
      `);

        // Insert data if table is empty
        const [rows] = await db.execute('SELECT COUNT(*) AS count FROM books');
        if (rows[0].count === 0) {
            await db.execute(`
          INSERT INTO books (title, author) VALUES
          ('1984', 'George Orwell'),
          ('To Kill a Mockingbird', 'Harper Lee'),
          ('Brave New World', 'Aldous Huxley')
        `);
        }
    } catch (err) {
        console.error('Error setting up database. Ensure Mysql is running: service mysql start', err);
    }
})();

// Route to return books as JSON
app.get('/', async (req, res) => {
    try {
        const [books] = await db.execute('SELECT * FROM books');
        res.json(books);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;