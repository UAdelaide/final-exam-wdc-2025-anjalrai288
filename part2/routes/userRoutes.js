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

// POST login (changed version)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query(`
      SELECT user_id, username, role, password_hash FROM Users
      WHERE username = ?
    `, [username]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = rows[0];

    if (user.password_hash !== password) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    req.session.user = {
      user_id: user.user_id,
      username: user.username,
      role: user.role
    };

    const redirectURL = user.role === 'owner' ? '/owner-dashboard.html' : '/walker-dashboard.html';

    res.json({
      success: true,
      message: 'Login successful',
      redirect: redirectURL
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed due to server error' });
  }
});

router.post('/logout',(req,res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({success: false, message: 'Logout failed'});
    }
    res.clearCookie('connect.sid');
    res.json({success: true, message: 'Logged out successfully'});
  });
});

router.get('/api/my-dogs', async (req, res) => {
  const ownerId = req.session.user?.user_id;

  if (!ownerId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const [rows] = await db.query('SELECT dog_id, name FROM Dogs WHERE owner_id = ?', [ownerId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load dogs' });
  }
});

router.get('/api/dogs', async(req, res) =>{
  try {
    const [rows] = await db.query(`
      SELECT Dogs.dog_id, Dogs.name, Dogs.size, Users.username AS owner_name
      FROM Dogs
      JOIN Users ON Dogs.owner_id = Users.user_id`);
      res.json(rows);
    } catch (err) {
      res.status(500)
    }

  }
})



module.exports = router;