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
                ('davidowner', 'david@example.com', 'securepass1', 'owner'),
                ('evewalker', 'eve@example.com', 'securepass2', 'walker');
            `);
            console.log('Users inserted.');

        }















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