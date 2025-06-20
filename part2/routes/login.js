const express = require('express');
const router = express.Router;
const db = require('../db');

router.post('/login', async (req , res) =>{
    const { username , password} =req.body;

    db.query('SELECT * FROM USERS WHERE username = ?', [username],(err, result) => {
        if (err) return res.status(500).json({success: false,message}) )
})