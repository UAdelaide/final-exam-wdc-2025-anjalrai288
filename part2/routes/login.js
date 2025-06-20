const express = require('express');
const router = express.Router;
const db = require('../db');

router.post('/login', async (req , res) =>{
    const { username , password} =req.body;

    db.query('SELECT * FROM USERS WHERE username = ?', [username],(err, result) => {
        if (err) return res.status(500).json({success: false,message: 'DataBase error'});
        if (result.length === 0) return res.json({success: false, message: 'user not found'});
    }

        const user =results[0];
        if (password !== user.password_hash){
            return res.json({success: false, message: 'Incorrect password' });
        }

        req.session.userId = user.user_id;
        req.session.username = username;
        req.session.role=user.role;

        if(user.role)




    )
})