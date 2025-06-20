const express = require('express');
const router = express.Router;
const db = require('../db');

router.post('/login', async (req , res) =>{
    const { username , password} =req.body;

    db.
})