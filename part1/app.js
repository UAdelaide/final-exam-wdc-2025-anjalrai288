// app.js

var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise'); // Using the promise-based version

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

let db; // Global variable to hold the database connection

// Asynchronous IIFE (Immediately Invoked Function Expression) to set up the database
(async () => {
  try {
    // Establish connection to MySQL server
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '' // IMPORTANT: Set your MySQL root password here if you have one
    });

    // Create the DogWalkService database if it doesn't exist.
    // This is optional if you've already run dogwalks.sql, but good for robustness.
    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await connection.end(); // End the initial connection

    // Now connect to the DogWalkService database
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '', // IMPORTANT: Set your MySQL root password here
      database: 'DogWalkService' // Connect to our specific database
    });

    console.log('Connected to DogWalkService database.');

    // --- Insert initial records for DogWalkService ---
    // This logic ensures data is present for testing the API endpoints.
    // Wrap insertions in a transaction for atomicity.
    await db.beginTransaction();
    try {
        // Optional: Clear existing data for a fresh start each time the app runs
        // Order of deletion matters due to foreign key constraints
        await db.execute('SET FOREIGN_KEY_CHECKS = 0;'); // Temporarily disable FK checks for deletion
        await db.execute('TRUNCATE TABLE WalkRatings;');
        await db.execute('TRUNCATE TABLE WalkApplications;');
        await db.execute('TRUNCATE TABLE WalkRequests;');
        await db.execute('TRUNCATE TABLE Dogs;');
        await db.execute('TRUNCATE TABLE Users;');
        await db.execute('SET FOREIGN_KEY_CHECKS = 1;'); // Re-enable FK checks
        console.log('Existing DogWalkService data cleared (if any).');

        // 1. Insert Users
        await db.execute(`
            INSERT INTO Users (username, email, password_hash, role)
            VALUES
            ('alice123', 'alice@example.com', 'hashed123', 'owner'),
            ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
            ('carol123', 'carol@example.com', 'hashed789', 'owner'),
            ('davidowner', 'david@example.com', 'securepass1', 'owner'),
            ('evewalker', 'eve@example.com', 'securepass2', 'walker');
        `);
        console.log('Users inserted.');

        // 2. Insert Dogs (using subqueries for owner_id)
        await db.execute(`
            INSERT INTO Dogs (owner_id, name, size)
            VALUES
            ((SELECT user_id FROM Users WHERE username = 'alice123' AND role = 'owner'), 'Max', 'medium'),
            ((SELECT user_id FROM Users WHERE username = 'carol123' AND role = 'owner'), 'Bella', 'small'),
            ((SELECT user_id FROM Users WHERE username = 'davidowner' AND role = 'owner'), 'Rocky', 'large'),
            ((SELECT user_id FROM Users WHERE username = 'alice123' AND role = 'owner'), 'Daisy', 'small'),
            ((SELECT user_id FROM Users WHERE username = 'carol123' AND role = 'owner'), 'Gus', 'medium');
        `);
        console.log('Dogs inserted.');

        // 3. Insert WalkRequests (using subqueries for dog_id and owner_id indirectly for clarity)
        await db.execute(`
            INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
            VALUES
            ((SELECT dog_id FROM Dogs WHERE name = 'Max' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
            ((SELECT dog_id FROM Dogs WHERE name = 'Bella' AND owner_id = (SELECT user_id FROM Users WHERE username = 'carol123')), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
            ((SELECT dog_id FROM Dogs WHERE name = 'Rocky' AND owner_id = (SELECT user_id FROM Users WHERE username = 'davidowner')), '2025-06-11 10:00:00', 60, 'City Center', 'open'),
            ((SELECT dog_id FROM Dogs WHERE name = 'Daisy' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')), '2025-06-12 14:00:00', 20, 'River Path', 'open'),
            ((SELECT dog_id FROM Dogs WHERE name = 'Gus' AND owner_id = (SELECT user_id FROM Users WHERE username = 'carol123')), '2025-06-13 16:00:00', 30, 'Suburban Park', 'cancelled');
        `);
        console.log('WalkRequests inserted.');

        // 4. Insert WalkApplications (example data for testing /api/walkers/summary later)
        await db.execute(`
            INSERT INTO WalkApplications (request_id, walker_id, status)
            VALUES
            ((SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Max') AND status = 'open' LIMIT 1), (SELECT user_id FROM Users WHERE username = 'bobwalker'), 'pending'),
            ((SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Rocky') AND status = 'open' LIMIT 1), (SELECT user_id FROM Users WHERE username = 'evewalker'), 'pending'),
            -- Let's assume bobwalker accepts Bella's walk (which was 'accepted' initially) and completes it
            ((SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Bella') AND status = 'accepted' LIMIT 1), (SELECT user_id FROM Users WHERE username = 'bobwalker'), 'accepted');
        `);
        console.log('WalkApplications inserted.');

        // Update Bella's walk request to 'completed' and then add a rating for it.
        await db.execute(`
            UPDATE WalkRequests
            SET status = 'completed'
            WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Bella') AND status = 'accepted'
            LIMIT 1;
        `);
        console.log('Bella\'s walk request updated to completed.');

        // 5. Insert WalkRatings (example data for testing /api/walkers/summary later)
        await db.execute(`
            INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
            VALUES
            (
                (SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Bella') AND status = 'completed' LIMIT 1),
                (SELECT user_id FROM Users WHERE username = 'bobwalker'),
                (SELECT user_id FROM Users WHERE username = 'carol123'),
                5,
                'Bobwalker was excellent with Bella!'
            );
        `);
        console.log('WalkRatings inserted.');

        // Add another completed walk and rating for bobwalker to test average_rating
        await db.execute(`
            UPDATE WalkRequests
            SET status = 'completed'
            WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Daisy') AND status = 'open'
            LIMIT 1;
        `);
        await db.execute(`
            INSERT INTO WalkApplications (request_id, walker_id, status)
            VALUES (
                (SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Daisy') AND status = 'completed' LIMIT 1),
                (SELECT user_id FROM Users WHERE username = 'bobwalker'),
                'accepted'
            );
        `);
        await db.execute(`
            INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
            VALUES
            (
                (SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Daisy') AND status = 'completed' LIMIT 1),
                (SELECT user_id FROM Users WHERE username = 'bobwalker'),
                (SELECT user_id FROM Users WHERE username = 'alice123'),
                4,
                'Bobwalker did a good job with Daisy.'
            );
        `);
        console.log('Additional completed walk and rating for Bobwalker inserted.');

        await db.commit(); // Commit the transaction
        console.log('All initial records inserted successfully!');

    } catch (insertErr) {
        await db.rollback(); // Rollback on any insert error
        console.error('Error inserting initial records, rolling back:', insertErr);
        // Important: If data insertion fails, the database might be in an inconsistent state.
        // For a production app, you might want to prevent the server from starting or alert more aggressively.
    }

  } catch (err) {
    console.error('Error setting up database. Ensure MySQL is running and password is correct:', err);
    // If database connection or initial setup fails, exit the process or handle appropriately
    process.exit(1); // Exit if DB connection fails critical startup
  }
})();


// Define API Routes

// /api/dogs
// Returns a list of all dogs with their size and owner's username.
app.get('/api/dogs', async (req, res) => {
    try {
        if (!db) { // Check if db connection is established
            return res.status(503).json({ error: 'Database not initialized.' });
        }
        const [rows] = await db.execute(`
            SELECT
                d.name AS dog_name,
                d.size,
                u.username AS owner_username
            FROM
                Dogs d
            JOIN
                Users u ON d.owner_id = u.user_id
            WHERE u.role = 'owner'; -- Ensure only owners are linked
        `);
        res.json(rows); // Return as JSON
    } catch (error) {
        console.error('Error fetching dogs:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// /api/walkrequests/open
// Return all open walk requests, including the dog name, requested time, location, and owner's username.
app.get('/api/walkrequests/open', async (req, res) => {
    try {
        if (!db) { // Check if db connection is established
            return res.status(503).json({ error: 'Database not initialized.' });
        }
        const [rows] = await db.execute(`
            SELECT
                wr.request_id,
                d.name AS dog_name,
                wr.requested_time,
                wr.duration_minutes,
                wr.location,
                u.username AS owner_username
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

// /api/walkers/summary
// Return a summary of each walker with their average rating and number of completed walks.
app.get('/api/walkers/summary', async (req, res) => {
    try {
        if (!db) { // Check if db connection is established
            return res.status(503).json({ error: 'Database not initialized.' });
        }
        const [rows] = await db.execute(`
            SELECT
                u.username AS walker_username,
                COUNT(DISTINCT wr.request_id) AS completed_walks,
                COALESCE(AVG(wrat.rating), 0.0) AS average_rating, -- Change NULL to 0.0 for AVG to ensure a float type
                COUNT(wrat.rating_id) AS total_ratings -- Count of actual ratings received
            FROM
                Users u
            LEFT JOIN
                WalkApplications wa ON u.user_id = wa.walker_id AND wa.status = 'accepted'
            LEFT JOIN
                WalkRequests wr ON wa.request_id = wr.request_id AND wr.status = 'completed'
            LEFT JOIN
                WalkRatings wrat ON wr.request_id = wrat.request_id AND u.user_id = wrat.walker_id
            WHERE
                u.role = 'walker'
            GROUP BY
                u.user_id, u.username
            ORDER BY
                u.username;
        `);

        // Format average_rating to one decimal place as per sample if it's not null.
        // Also handle the case where total_ratings is 0, returning null for average_rating.
        const formattedRows = rows.map(row => {
            // Use parseFloat directly on the database result. This is the most robust way to ensure a number.
            // It will convert numeric strings (like '4.5') to numbers, and non-numeric to NaN.
            const averageRatingValue = parseFloat(row.average_rating);

            // Determine the final average_rating based on total_ratings and validity
            let finalAverageRating = null;
            if (row.total_ratings > 0 && !isNaN(averageRatingValue)) {
                // If there are ratings and the value is a valid number, format it.
                finalAverageRating = parseFloat(averageRatingValue.toFixed(1));
            }

            return {
                walker_username: row.walker_username,
                total_ratings: row.total_ratings,
                average_rating: finalAverageRating,
                completed_walks: row.completed_walks
            };
        });

        res.json(formattedRows); // Return as JSON
    } catch (error) {
        console.error('Error fetching walkers summary:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

app.use(express.static(path.join(__dirname, 'public'))); // Keep static file serving

module.exports = app; // Export the app for use by bin/www or direct server start
