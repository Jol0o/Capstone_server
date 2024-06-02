const express = require('express');
const router = express.Router();
const mysql = require('mysql');
const { hashPassword, comparePassword, generateToken, verifyToken } = require('../utils/auth');
const db = require('../db');
const { check, validationResult } = require('express-validator');

// Register a new user
router.post('/register', async (req, res) => {
    const { email, password } = req.body;

    // Check if email or password is null or empty
    if (!email || !password) {
        return res.status(400).json({ message: 'email and password are required' });
    }

    const hashedPassword = await hashPassword(password);

    db.query(
        'INSERT INTO users (email, password) VALUES (?, ?)',
        [email, hashedPassword],
        (error) => {
            if (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ message: 'email already exists' });
                }
                throw error;
            }
            res.sendStatus(201);
        }
    );
});


// Login a user
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ?', [email], async (error, results) => {
        if (error) throw error;

        if (results.length === 0) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const user = results[0];
        const { password: userPassword, ...userWithoutPassword } = user;
        const isMatch = await comparePassword(password, userPassword);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }
        const token = generateToken(user);
        res.json({ token, user: userWithoutPassword });
    });
});

router.post('/admin/register', [
    // ... other validations ...
    check('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(/\d/).withMessage('Password must contain a number')
        .matches(/[a-zA-Z]/).withMessage('Password must contain a letter'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const hashedPassword = await hashPassword(password);

    db.query(
        'INSERT INTO admins (email, password) VALUES (?, ?)',
        [email, hashedPassword],
        (error) => {
            if (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ message: 'email already exists' });
                }
                throw error;
            }
            res.sendStatus(201);
        }
    );
});


router.post('/admin/login', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM admins WHERE email = ?', [email], async (error, results) => {
        if (error) throw error;

        if (results.length === 0) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const admin = results[0];
        const { password: adminPassword, ...adminWithoutPassword } = admin;
        const isMatch = await comparePassword(password, adminPassword);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const token = generateToken(adminWithoutPassword);
        res.json({ token, admin: adminWithoutPassword });
    });
});

module.exports = router;
