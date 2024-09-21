const express = require('express');
const router = express.Router();
const mysql = require('mysql');
const { hashPassword, comparePassword, generateToken, verifyToken } = require('../utils/auth');
const db = require('../db');
const { check, validationResult } = require('express-validator');
const cookieParser = require('cookie-parser');


router.use(cookieParser());
// Register a new user
router.post('/register', async (req, res) => {
    const { email, password, user_id } = req.body;

    // Check if email or password is null or empty
    if (!email || !password || !user_id) {
        return res.status(400).json({ message: 'email and password are required' });
    }

    const hashedPassword = await hashPassword(password);

    db.query(
        'INSERT INTO user (email, password, user_id) VALUES (?, ?, ?)',
        [email, hashedPassword, user_id],
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

    // Query the users table to check credentials
    db.query('SELECT * FROM user WHERE email = ?', [email], async (error, results) => {
        if (error) {
            console.error('Database query error (users):', error);
            return res.status(500).json({ message: 'Internal server error' });
        }

        if (results.length === 0) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const user = results[0];
        const { password: userPassword, ...userWithoutPassword } = user;
        const isMatch = await comparePassword(password, userPassword);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Optional: Additional validation against employees table if necessary
        db.query('SELECT * FROM employees WHERE email = ?', [email], (error, results) => {
            if (error) {
                console.error('Database query error (employees):', error);
                return res.status(500).json({ message: 'Internal server error' });
            }

            if (results.length === 0) {
                return res.status(400).json({ message: 'Invalid email or password' });
            }

            // Generate JWT token
            const token = generateToken(results[0]);
            // console.log('Generated Token:', token); 

            // Set the token in an HTTP-only cookie
            res.cookie('token', token, {
                httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
                secure: process.env.NODE_ENV === 'production', // Send cookie only over HTTPS in production
                maxAge: 7 * 24 * 60 * 60 * 1000, // Cookie expiry set to 1 week
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Cross-site handling
            });

            console.log('Cookies after setting token:', req.cookies); // Log cookies after setting token for debugging

            // Return the token and user data (excluding password)
            return res.json({ token, user: userWithoutPassword });
        });
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
        'INSERT INTO admin (email, password) VALUES (?, ?)',
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

    db.query('SELECT * FROM admin WHERE email = ?', [email], async (error, results) => {
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
        res.cookie('token', token, {
            httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
            secure: process.env.NODE_ENV === 'production', // Send cookie only over HTTPS in production
            maxAge: 7 * 24 * 60 * 60 * 1000, // Cookie expiry set to 1 week
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Cross-site handling
        });
        res.json({ token, admin: adminWithoutPassword });
    });
});

// Logout a user
router.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: false, // Set to false for localhost
        sameSite: 'lax', // Adjust sameSite attribute as needed
        path: '/' // Ensure the path is set correctly
    });
    res.status(200).json({ message: 'Logged out successfully' });
});

//check if there is token

router.get('/check-token', (req, res) => {
    const token = req.cookies.token;

    if (token) {
        return res.status(200).json({ message: 'Token available', data: token })
    } else {
        return res.status(404).json({ message: 'Token not available' })
    }
})


module.exports = router;
