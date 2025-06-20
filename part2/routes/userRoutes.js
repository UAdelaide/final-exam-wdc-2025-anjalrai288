const express = require('express');
const router = express.Router();
const db = require('../models/db');

// GET all users (for admin/testing)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT user_id, username, email, role FROM Users');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST a new user (simple signup)
router.post('/register', async (req, res) => {
  const { username, email, password, role } = req.body;

  try {
    const [result] = await db.query(`
      INSERT INTO Users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `, [username, email, password, role]);

    res.status(201).json({ message: 'User registered', user_id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json(req.session.user);
});

// POST login (dummy version)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  db.query('SELECT * FROM Users WHERE username = ?', [username], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DataBase error' });
    if (results.length === 0) return res.json({ success: false, message: 'User not found' });

    const user = results[0];
    if (password !== user.password_hash) {
      return res.json({ success: false, message: 'Incorrect password' });
    }

    req.session.userId = user.user_id;
    req.session.username = username;
    req.session.role = user.role;

    if (user.role === 'owner') {
      return res.json({ success: true, redirect: '/owner-dashboard.html' });
    } else {
        return res.json({ success: true, redirect: '/walker-dashboard.html' });
    }
  });
});

module.exports = router;