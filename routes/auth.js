const express = require('express');
const router = express.Router();
const mysql = require('mysql');
const { hashPassword, comparePassword, generateToken, verifyToken } = require('../utils/auth');
const db = require('../db');
const { check, body, validationResult } = require('express-validator');
const cookieParser = require('cookie-parser');
const authMiddleware = require('../middleware/auth');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


router.use(cookieParser());
// Register a new user

router.post(
    '/register',
    [
        // Validation rules
        body('email')
            .isEmail()
            .withMessage('Invalid email address')
            .normalizeEmail(),
        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters long')
            .matches(/\d/)
            .withMessage('Password must contain a number')
            .matches(/[a-zA-Z]/)
            .withMessage('Password must contain a letter')
            .matches(/[A-Z]/)
            .withMessage('Password must contain an uppercase letter')
            .matches(/[!@#$%^&*(),.?":{}|<>]/)
            .withMessage('Password must contain a special character'),
        body('name')
            .notEmpty()
            .withMessage('Name is required')
            .trim()
            .escape()
            .matches(/^[a-zA-Z\s]+$/)
            .withMessage('Name must not contain special characters'),
        body('phone_number')
            .matches(/^[0-9]{11}$/)
            .withMessage('Phone number must be exactly 11 digits and must not contain special characters'),
    ],
    async (req, res) => {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, name, phone_number } = req.body;

        try {
            // Hash the password
            const hashedPassword = await hashPassword(password);

            // Check for existing email or phone number
            const existingRequest = await prisma.employeeRequest.findFirst({
                where: {
                    OR: [{ email }, { phone_number }],
                },
            });

            
            const existingEmployee = await prisma.employees.findFirst({
                where: {
                    OR: [
                        { email: email },
                        { phone_number: phone_number }
                    ]
                }
            });

            if (existingRequest || existingEmployee) {
                return res.status(400).json({ message: 'Email or phone number already exists' });
            }

            // Create a new employee request
            await prisma.employeeRequest.create({
                data: {
                    email,
                    password: hashedPassword,
                    name,
                    phone_number,
                    status: 'pending',
                },
            });

            res.sendStatus(201);
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);


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

            // Return the token and user data (excluding password)
            return res.json({ token, user: userWithoutPassword });
        });
    });
});




router.post('/admin/register', [
    check('name')
        .notEmpty().withMessage('Name is required')
        .trim()
        .escape(),
    check('email')
        .isEmail().withMessage('Invalid email address')
        .normalizeEmail(),
    check('position')
        .notEmpty().withMessage('Position is required')
        .trim()
        .escape(),
    check('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(/\d/).withMessage('Password must contain a number')
        .matches(/[a-zA-Z]/).withMessage('Password must contain a letter'),
], authMiddleware,  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, position, password } = req.body;

    const hashedPassword = await hashPassword(password);

    db.query(
        'INSERT INTO admin (name, email,position, password) VALUES (?, ? ,? ,?)',
        [name, email, position, hashedPassword],
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

router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(email);
    try {
        // Check in admin table
        db.query('SELECT * FROM admin WHERE email = ?', [email], async (err, adminResults) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Database query error' });
            }

            let results = adminResults;
            let userType = 'admin';

            // If no match in admin table, check in user table
            if (results.length === 0) {
                db.query('SELECT * FROM user WHERE email = ?', [email], async (err, userResults) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ message: 'Database query error' });
                    }

                    results = userResults;
                    userType = 'employee';

                    if (results.length === 0) {
                        return res.status(400).json({ message: 'Invalid email or password' });
                    }

                    // Proceed with password validation and response
                    const user = results[0];
                    const { password: userPassword, employee_id, ...userWithoutPassword } = user;
                    const isMatch = await comparePassword(password, userPassword);

                    if (!isMatch) {
                        return res.status(400).json({ message: 'Invalid email or password' });
                    }

                    // Fetch the avatar from the employee table
                    db.query('SELECT avatar FROM employees WHERE employee_id = ?', [employee_id], (err, employeeResults) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({ message: 'Database query error' });
                        }

                        const avatar = employeeResults.length > 0 ? employeeResults[0].avatar : null;

                        // Generate token and set cookie
                        const token = generateToken(userWithoutPassword);
                        res.cookie('token', token, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
                            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                        });

                        return res.json({ token, user: { ...userWithoutPassword, avatar }, userType });
                    });
                });
            } else {
                // Admin found, validate password and return token
                const user = results[0];
                const { password: userPassword, ...userWithoutPassword } = user;
                const isMatch = await comparePassword(password, userPassword);

                if (!isMatch) {
                    return res.status(400).json({ message: 'Invalid email or password' });
                }

                // Generate token and set cookie
                const token = generateToken(userWithoutPassword);
                res.cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                });

                return res.json({ token, user: userWithoutPassword, userType });
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});


router.post('/reset-password', async (req, res) => {
    const { email } = req.body;

    try {
        // Check if user exists in user table
        db.query('SELECT * FROM user WHERE email = ?', [email], (userErr, userResults) => {
            if (userErr) throw userErr;

            // Check if employee exists in employee table
            db.query('SELECT * FROM employees WHERE email = ?', [email], async (employeeErr, employeeResults) => {
                if (employeeErr) throw employeeErr;

                if (userResults.length === 0 && employeeResults.length === 0) {
                    return res.status(400).json({ message: 'User not found' });
                }

                const randomText = crypto.randomBytes(8).toString('hex'); // Generate random text
                const hashedPassword = await hashPassword(randomText);

                // Update password in user table if email exists
                if (userResults.length > 0) {
                    db.query('UPDATE user SET password = ? WHERE email = ?', [hashedPassword, email], (updateUserErr) => {
                        if (updateUserErr) throw updateUserErr;
                    });
                }

                // Update password in employee table if email exists
                if (employeeResults.length > 0) {
                    db.query('UPDATE employees SET password = ? WHERE email = ?', [hashedPassword, email], (updateEmployeeErr) => {
                        if (updateEmployeeErr) throw updateEmployeeErr;
                    });
                }

                // Send email with the random text
                const transporter = nodemailer.createTransport({
                    host: "smtp.gmail.com",
                    port: 465,
                    secure: true,
                    auth: {
                        user: process.env.EMAIL,
                        pass: process.env.APP_PASSWORD,
                    },
                    tls: {
                        rejectUnauthorized: false
                    }
                });

                const mailOptions = {
                    to: email,
                    from: process.env.EMAIL_USER,
                    subject: 'Password Reset',
                    text: `Your new password is: ${randomText}\nPlease change it immediately after logging in.`,
                };

                await transporter.sendMail(mailOptions);

                res.status(200).json({ message: 'Password reset link sent' });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Logout a user
router.post('/logout', (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';

    res.clearCookie('token', {
        httpOnly: true,
        secure: isProduction, // Set to true if in production
        sameSite: 'lax', // Adjust sameSite attribute as needed
        path: '/' // Ensure the path is set correctly
    });
    res.status(200).json({ message: 'Logged out successfully' });
});

//check if there is token
router.get('/check-token', authMiddleware, async (req, res) => {
    const token = req.cookies.token;
    const user = req.user

    if (!token || !user) {
        return res.status(404).json({ message: 'Token not available' });
    }

    try {
        const email = user.email
        // Check in admin table
        let results = db.query('SELECT * FROM admin WHERE email = ?', [email]);
        let userType = 'admin';

        if (results.length === 0) {
            // If no match in admin table, check in user table
            results = db.query('SELECT * FROM user WHERE email = ?', [email]);
            userType = 'employee';

            if (results.length === 0) {
                return res.status(404).json({ message: 'User not found' });
            }
        }

        res.status(200).json({ message: 'Token available', data: token, userType });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;
