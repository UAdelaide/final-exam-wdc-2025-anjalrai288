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


   console.log('Connected to DogWalkService database.');

   await db.beginTransaction();
   try {
       await db.execute('SET FOREIGN_KEY_CHECKS = 0;');
       await db.execute('TRUNCATE TABLE WalkRatings;');
       await db.execute('TRUNCATE TABLE WalkApplications;');
       await db.execute('TRUNCATE TABLE WalkRequests;');
       await db.execute('TRUNCATE TABLE Dogs;');
       await db.execute('TRUNCATE TABLE Users;');
       await db.execute('SET FOREIGN_KEY_CHECKS = 1;');
       console.log('Existing DogWalkService data cleared (if any).');


       // 1. Insert Users
       await db.execute(`
           INSERT INTO Users (username, email, password_hash, role)
VALUES
('alice123', 'alice@example.com', 'hashed123', 'owner'),
('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
('carol123', 'carol@example.com', 'hashed789', 'owner'),
('ghjb456', 'ghjb@example.com', 'hashed109', 'walker'),
('dcs321', 'dcs@example.com', 'hashed202', 'owner');
       `);
       console.log('Users inserted.');


       // 2. Insert Dogs
       await db.execute(`
           INSERT INTO Dogs (owner_id, name, size)
VALUES
((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
((SELECT user_id FROM Users WHERE username = 'carol123'), 'Cha', 'large'),
((SELECT user_id FROM Users WHERE username = 'alice123'), 'Ram', 'small'),
((SELECT user_id FROM Users WHERE username = 'carol123'), 'Rai', 'medium');
       `);
       console.log('Dogs inserted.');


       // 3. Insert WalkRequests
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

   } catch (insertErr) {
       await db.rollback(); // Rollback on any insert error
       console.error('Error inserting initial records, rolling back:', insertErr);
   }


 } catch (err) {
   console.error('Error setting up database. Ensure MySQL is running and password is correct:', err);
   process.exit(1);
 }
})();

app.get('/api/dogs', async (req, res) => {
   try {
       if (!db) {
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
       res.json(rows);
   } catch (error) {
       console.error('Error fetching dogs:', error);
       res.status(500).json({ error: 'Internal server error', message: error.message });
   }
});

app.get('/api/walkrequests/open', async (req, res) => {
   try {
       if (!db) {
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
       res.json(rows);
   } catch (error) {
       console.error('Error fetching open walk requests:', error);
       res.status(500).json({ error: 'Internal server error', message: error.message });
   }
});

app.get('/api/walkers/summary', async (req, res) => {
   try {
       if (!db) {
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

       const formattedRows = rows.map(row => {
           const averageRatingValue = parseFloat(row.average_rating);
           let finalAverageRating = null;
           if (row.total_ratings > 0 && !isNaN(averageRatingValue)) {
               finalAverageRating = parseFloat(averageRatingValue.toFixed(1));
           }


           return {
               walker_username: row.walker_username,
               total_ratings: row.total_ratings,
               average_rating: finalAverageRating,
               completed_walks: row.completed_walks
           };
       });


       res.json(formattedRows);
   } catch (error) {
       console.error('Error fetching walkers summary:', error);
       res.status(500).json({ error: 'Internal server error', message: error.message });
   }
});


app.use(express.static(path.join(__dirname, 'public')));


module.exports = app;



