const express = require('express');
const db = require('../db');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const sendEmail = require('../email_template/sendEmail');
const { hashPassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const moment = require('moment-timezone');

const leaveRequestStatus = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected'
};

router.get('/hello', (req, res) => {
    res.send({ express: 'Hello From Express' });
});


router.post('/create_employee', [
    check('employee_id').notEmpty().withMessage('Employee ID is required'),
    check('name').notEmpty().withMessage('Name is required'),
    check('email').isEmail().withMessage('Valid email is required'),
    check('salary_date').notEmpty().withMessage('Salary date is required'),
    check('department').notEmpty().withMessage('Department is required'),
    check('position').notEmpty().withMessage('Position is required'),
    check('qrcode').notEmpty().withMessage('QR code is required'),
    check('phone_number').isLength({ min: 11, max: 11 }).withMessage('Phone number must be exactly 11 digits'),
    check('salary').matches(/^[1-9]\d*$/).withMessage('Salary must not start with 0'),
    check('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { employee_id, name, email, salary_date, department, position, qrcode, phone_number, salary, password, day_off } = req.body;

    const query = `INSERT INTO employees (employee_id, name, email, salary_date, department, position, qrcode, phone_number, salary, password, day_off) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(query, [employee_id, name, email, salary_date, department, position, qrcode, phone_number, salary, password, day_off], async (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                const field = err.sqlMessage.match(/for key '(.+?)'/)[1];
                const fieldName = field.split('_')[1]; // Assuming the field name is after the first underscore
                return res.status(400).json({ status: 'error', message: `Duplicate entry detected for ${fieldName}. Please check the ${fieldName} field.` });
            } else {
                console.error(err);
                return res.status(500).json({ status: 'error', message: 'Internal server error' });
            }
        } else {
            try {
                await sendEmail(email, qrcode);
                res.status(200).json({ status: 'ok' });
                if (req.io) {
                    req.io.emit('employeeDataUpdate', { message: 'Employee data updated' });
                } else {
                    console.error('Socket.io instance not found');
                }
            } catch (emailErr) {
                console.error(emailErr);
                res.status(500).json({ status: 'error', message: 'Failed to send email' });
            }
        }
    });
});

router.get('/search_employee', async (req, res) => {
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ status: 'error', message: 'Query parameter q is required' });
    }

    let query = 'SELECT * FROM employees WHERE 1=1';
    const queryParams = [];

    // Search across multiple fields
    query += ' AND (employee_id LIKE ? OR name LIKE ? OR email LIKE ? OR department LIKE ? OR position LIKE ? OR phone_number LIKE ?)';
    const searchPattern = `%${q}%`;
    queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        res.status(200).json({ status: 'ok', data: results });
    });
});


router.get('/search_attendance', async (req, res) => {
    const { q, limit = 10, offset = 0 } = req.query;

    if (!q) {
        return res.status(400).json({ status: 'error', message: 'Query parameter q is required' });
    }

    let query = `
        SELECT attendance.*, employees.name, employees.avatar
        FROM attendance 
        INNER JOIN employees ON attendance.employee_id = employees.employee_id
        WHERE 1=1
        AND (attendance.employee_id LIKE ? OR attendance.attendance_id LIKE ?)
        ORDER BY attendance.date DESC
        LIMIT ? OFFSET ?
    `;
    const queryParams = [];
    const searchPattern = `%${q}%`;
    queryParams.push(searchPattern, searchPattern, parseInt(limit), parseInt(offset));

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        res.status(200).json({ status: 'ok', data: results });
    });
});


router.get('/search_payroll', async (req, res) => {
    const { q, limit = 10, offset = 0 } = req.query;

    if (!q) {
        return res.status(400).json({ status: 'error', message: 'Query parameter q is required' });
    }

    let query = `
        SELECT payroll.*, employees.name, employees.avatar
        FROM payroll 
        INNER JOIN employees ON payroll.employee_id = employees.employee_id
        WHERE 1=1
        AND (payroll.employee_id LIKE ? OR payroll.payroll_id LIKE ?)
        LIMIT ? OFFSET ?
    `;
    const queryParams = [];
    const searchPattern = `%${q}%`;
    queryParams.push(searchPattern, searchPattern, parseInt(limit), parseInt(offset));

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        res.status(200).json({ status: 'ok', data: results });
    });
});


router.get('/search_leave_request', async (req, res) => {
    const { q, limit = 10, offset = 0 } = req.query;

    if (!q) {
        return res.status(400).json({ status: 'error', message: 'Query parameter q is required' });
    }

    let query = `
        SELECT leaveRequest.*, employees.name, employees.avatar
        FROM leaveRequest 
        INNER JOIN employees ON leaveRequest.employee_id = employees.employee_id
        WHERE 1=1
        AND (leaveRequest.employee_id LIKE ? OR leaveRequest.leave_type LIKE ? OR leaveRequest.reason LIKE ? OR leaveRequest.status LIKE ?)
        ORDER BY leaveRequest.created_at DESC
        LIMIT ? OFFSET ?
    `;
    const queryParams = [];
    const searchPattern = `%${q}%`;
    queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, parseInt(limit), parseInt(offset));

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        res.status(200).json({ status: 'ok', data: results });
    });
});


router.post('/send_email', async (req, res) => {
    const { email, qrcode } = req.body;
    // console.log(email, qrcode)
    try {
        await sendEmail(email, qrcode);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error' });
    }
});

router.post('/time_in', authMiddleware, async (req, res) => {
    const { employee_id, attendance_id } = req.body;

    // Get the current date and time in the Philippines timezone
    const now = moment().tz('Asia/Manila');
    const currentDate = now.format('YYYY-MM-DD'); // Format the date as YYYY-MM-DD
    const time_in = now.format('hh:mm A'); // Format the time as hh:mm AM/PM

    if (!employee_id) {
        return res.status(400).json({ status: 'error', message: 'Employee_id is required' });
    }

    const query = `INSERT INTO attendance (employee_id, time_in, date, attendance_id, time_out) VALUES (?, ?, ?, ?, ?)`;

    db.query(query, [employee_id, time_in, currentDate, attendance_id, ''], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok' });
            if (req.io) {
                req.io.emit('attendanceUpdate', { message: 'Employee data updated' });
            } else {
                console.error('Socket.io instance not found');
            }
        }
    });
});


router.put('/time_out/:id', (req, res) => {
    const { id } = req.params;
    const { time_in } = req.body;

    if (!time_in) {
        return res.status(400).json({ status: 'error', message: 'time_in is required' });
    }

    const now = moment().tz('Asia/Manila');
    const time_out = now.format('hh:mm A'); // Format the time as hh:mm AM/PM

    // Helper function to parse time string in 'hh:mm A' format
    const parseTime = (timeString) => {
        const [time, modifier] = timeString.split(' ');
        let [hours, minutes] = time.split(':');

        if (hours === '12') {
            hours = '00';
        }

        if (modifier === 'PM' && hours !== '12') {
            hours = parseInt(hours, 10) + 12;
        }

        if (modifier === 'AM' && hours === '12') {
            hours = '00';
        }

        const currentDate = now.format('YYYY-MM-DD');
        return moment.tz(`${currentDate} ${hours}:${minutes}`, 'YYYY-MM-DD HH:mm', 'Asia/Manila');
    };

    const timeInDate = parseTime(time_in);
    const timeOutDate = now;

    // Calculate the difference in milliseconds
    const diffInMilliseconds = timeOutDate.diff(timeInDate);

    // Convert milliseconds to hours
    const diffInHours = diffInMilliseconds / (1000 * 60 * 60);

    const query = `UPDATE attendance SET time_out = ?, hours = ? WHERE attendance_id = ?`;

    db.query(query, [time_out, diffInHours, id], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok', hoursWorked: diffInHours });
            if (req.io) {
                req.io.emit('attendanceUpdate', { message: 'Employee data updated' });
            } else {
                console.error('Socket.io instance not found');
            }
        }
    });
});


// route for the employee table

router.get('/employees', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const countQuery = 'SELECT COUNT(*) as total FROM employees';
    const dataQuery = 'SELECT * FROM employees LIMIT ? OFFSET ?';

    db.query(countQuery, (err, countResult) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            const total = countResult[0].total;
            const totalPages = Math.ceil(total / limit);

            db.query(dataQuery, [limit, offset], (err, dataResult) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ status: 'error' });
                } else {
                    res.status(200).json({
                        status: 'ok',
                        data: dataResult,
                        currentPage: page,
                        totalPages: totalPages,
                        isLastPage: page === totalPages
                    });

                }
            });
        }
    });
});

router.get('/employee/:email', (req, res) => {
    const { email } = req.params;
    if (!email) return res.status(404).json({ status: 'email is required' });
    db.query('SELECT * FROM employees WHERE email = ?', [email], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            if (result.length > 0) {
                delete result[0].password;
            }
            res.status(200).json({ status: 'ok', data: result });
        }
    });
})

router.get('/employees/:employee', (req, res) => {
    const { employee } = req.params;
    db.query('SELECT * FROM employees WHERE employee_id = ?', [employee], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else if (result.length > 0) {
            if (result.length > 0) {
                delete result[0].password;
            }
            res.status(200).json({ status: 'ok', data: result });
        } else {
            res.status(404).json({ status: 'not found' });
        }
    });
});


router.get('/employees/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM employees WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            if (result.length > 0) {
                delete result[0].password;
            }
            res.status(200).json({ status: 'ok', data: result });
        }
    });
});


router.put('/employees/:id', [
    check('name').notEmpty().withMessage('Name is required'),
    check('email').isEmail().withMessage('Valid email is required'),
    check('salary_date').notEmpty().withMessage('Salary date is required'),
    check('department').notEmpty().withMessage('Department is required'),
    check('position').notEmpty().withMessage('Position is required'),
    check('qrcode').notEmpty().withMessage('QR code is required'),
    check('phone_number').isLength({ min: 11, max: 11 }).withMessage('Phone number must be exactly 11 digits'),
    check('salary').matches(/^[1-9]\d*$/).withMessage('Salary must not start with 0'),
], async (req, res) => {
    const { id } = req.params;
    const { name, email, salary_date, department, position, qrcode, phone_number, password, salary, avatar } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    let hashedPassword = password;

    try {
        // Fetch existing employee data
        const existingEmployee = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM employees WHERE id = ?', [id], (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result[0]);
                }
            });
        });

        if (!existingEmployee) {
            return res.status(404).json({ status: 'error', message: 'Employee not found' });
        }

        // Hash password if provided and different from the existing one
        if (password && password !== existingEmployee.password) {
            hashedPassword = await hashPassword(password);
            db.query('UPDATE user SET password = ? WHERE user_id = ?', [hashedPassword, existingEmployee.employee_id]);
        } else {
            hashedPassword = existingEmployee.password;
        }

        // Convert salary_date to the correct format
        const formattedSalaryDate = salary_date ? new Date(salary_date).toISOString().slice(0, 19).replace('T', ' ') : null;

        // Update employee data
        db.query(
            'UPDATE employees SET name = ?, email = ?, password = ?, salary_date = ?, department = ?, position = ?, phone_number = ?, salary = ?, qrcode = ?, avatar = ? WHERE id = ?',
            [name, email, hashedPassword, formattedSalaryDate, department, position, phone_number, salary, qrcode, avatar || null, id],
            (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        const field = err.sqlMessage.match(/for key '(.+?)'/)[1];
                        const fieldName = field.split('_')[1]; // Assuming the field name is after the first underscore
                        return res.status(400).json({ status: 'error', message: `Duplicate entry detected for ${fieldName}. Please check the ${fieldName} field.` });
                    } else {
                        console.error(err);
                        return res.status(500).json({ status: 'error', message: 'Internal server error' });
                    }
                }
                // Check if the email has changed and update the user table
                if (email && email !== existingEmployee.email) {
                    db.query('UPDATE user SET email = ? WHERE user_id = ?', [email, existingEmployee.employee_id], (err) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({ status: 'error' });
                        }
                    });
                }

                res.status(200).json({ status: 'ok', data: result });
                if (req.io) {
                    req.io.emit('employeeDataUpdate', { message: 'Employee data updated' });
                } else {
                    console.error('Socket.io instance not found');
                }
            }
        );
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error' });
    }
});

router.delete('/employee/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await db.query('DELETE FROM attendance WHERE employee_id = ?', [id]);
        await db.query('DELETE FROM payroll WHERE employee_id = ?', [id]);
        await db.query('DELETE FROM smsnotification WHERE employee_id = ?', [id]);
        await db.query('DELETE FROM employees WHERE employee_id = ?', [id]);

        await db.query('DELETE FROM user WHERE user_id = ?', [id]);

        res.status(200).json({ status: 'ok' });
        if (req.io) {
            req.io.emit('employeeDataUpdate', { message: 'Employee data updated' });
        } else {
            console.error('Socket.io instance not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Database error' });
    }
});


// routes for analytics
// get the monthly employees
router.get('/monthly_employees', (req, res) => {
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM employees WHERE YEAR(created_at) < YEAR(CURDATE()) OR (YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) < MONTH(CURDATE()))) as count_last_month,
            (SELECT COUNT(*) FROM employees WHERE YEAR(created_at) < YEAR(CURDATE()) OR (YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) <= MONTH(CURDATE()))) as count_this_month
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            if (result[0]) {
                const difference = result[0].count_this_month - result[0].count_last_month;
                res.status(200).json({
                    status: 'ok',
                    data: {
                        this_month: result[0].count_this_month,
                        last_month: result[0].count_last_month,
                        difference: difference
                    }
                });
            } else {
                res.status(200).json({
                    status: 'ok',
                    data: {
                        this_month: 0,
                        last_month: 0,
                        difference: 0
                    }
                });
            }
        }
    });
});

// get the early employees data
router.get('/early_employees', (req, res) => {
    const query = `
        SELECT 
            COUNT(CASE WHEN STR_TO_DATE(time_in, '%h:%i %p') < '08:00:00' AND DATE(date) = CURDATE() THEN 1 END) AS count_today,
            COUNT(CASE WHEN STR_TO_DATE(time_in, '%h:%i %p') < '08:00:00' AND DATE(date) = CURDATE() - INTERVAL 1 DAY THEN 1 END) AS count_yesterday
        FROM 
            attendance
        WHERE 
            DATE(date) = CURDATE() OR DATE(date) = CURDATE() - INTERVAL 1 DAY;
    `;

    db.query(query, (error, results, fields) => {
        if (error) {
            console.error('Database query error:', error);
            res.status(500).json({ status: 'error', message: 'Database query error' });
        } else {
            if (results.length > 0) {
                const difference = results[0].count_today - results[0].count_yesterday;
                res.status(200).json({
                    status: 'ok',
                    data: {
                        today: results[0].count_today,
                        yesterday: results[0].count_yesterday,
                        difference: difference
                    }
                });
            } else {
                res.status(200).json({
                    status: 'ok',
                    data: {
                        today: 0,
                        yesterday: 0,
                        difference: 0
                    }
                });
            }

        }
    });
});

//get the late employees data
router.get('/late_employees', (req, res) => {
    const query = `
        SELECT 
            COUNT(CASE WHEN STR_TO_DATE(time_in, '%h:%i %p') > '08:00:00' AND DATE(date) = CURDATE() THEN 1 END) AS count_today,
            COUNT(CASE WHEN STR_TO_DATE(time_in, '%h:%i %p') > '08:00:00' AND DATE(date) = CURDATE() - INTERVAL 1 DAY THEN 1 END) AS count_yesterday
        FROM 
            attendance
        WHERE 
            DATE(date) = CURDATE() OR DATE(date) = CURDATE() - INTERVAL 1 DAY;
    `;

    db.query(query, (error, results, fields) => {
        if (error) {
            console.error('Database query error:', error);
            res.status(500).json({ status: 'error', message: 'Database query error' });
        } else {
            if (results.length > 0) {
                const difference = results[0].count_today - results[0].count_yesterday;
                res.status(200).json({
                    status: 'ok',
                    data: {
                        today: results[0].count_today,
                        yesterday: results[0].count_yesterday,
                        difference: difference
                    }
                });
            } else {
                res.status(200).json({
                    status: 'ok',
                    data: {
                        today: 0,
                        yesterday: 0,
                        difference: 0
                    }
                });
            }

        }
    });
});


// get the early out employees
router.get('/early_departures', (req, res) => {
    const query = `
        SELECT 
            COUNT(CASE WHEN STR_TO_DATE(time_out, '%h:%i %p') < '19:00:00' AND DATE(date) = CURDATE() THEN 1 END) AS count_today,
            COUNT(CASE WHEN STR_TO_DATE(time_out, '%h:%i %p') < '19:00:00' AND DATE(date) = CURDATE() - INTERVAL 1 DAY THEN 1 END) AS count_yesterday
        FROM 
            attendance
        WHERE 
            DATE(date) = CURDATE() OR DATE(date) = CURDATE() - INTERVAL 1 DAY;
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            if (result.length > 0) {
                const difference = result[0].count_today - result[0].count_yesterday;
                res.status(200).json({
                    status: 'ok',
                    data: {
                        today: result[0].count_today,
                        yesterday: result[0].count_yesterday,
                        difference: difference
                    }
                });
            } else {
                res.status(200).json({
                    status: 'ok',
                    data: {
                        today: 0,
                        yesterday: 0,
                        difference: 0
                    }
                });
            }

        }
    });
});


//get the latest absents employees
router.get('/absent_employees', (req, res) => {
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM employees LEFT JOIN attendance ON employees.employee_id = attendance.employee_id AND DATE(attendance.date) = CURDATE() WHERE attendance.employee_id IS NULL AND employees.day_off = false) as count_today,
            (SELECT COUNT(*) FROM employees LEFT JOIN attendance ON employees.employee_id = attendance.employee_id AND DATE(attendance.date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE attendance.employee_id IS NULL AND employees.day_off = false) as count_yesterday
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            if (result.length > 0) {
                const difference = result[0].count_today - result[0].count_yesterday;
                res.status(200).json({ status: 'ok', data: { today: result[0].count_today, yesterday: result[0].count_yesterday, difference: difference } });
            } else {
                res.status(200).json({ status: 'ok', data: { today: 0, yesterday: 0, difference: 0 } });
            }
        }
    });
});

//get the employees who are on their day off
router.get('/off', (req, res) => {
    const query = `
        SELECT 
            employees.*
        FROM 
            employees
        WHERE 
            employees.day_off = true
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok', data: result });
        }
    });
})


// get the monthly attendance
router.get('/monthly_attendance', (req, res) => {
    const query = `
        SELECT 
            DATE_FORMAT(date, '%M %d') as day, COUNT(*) as attendance_count
        FROM 
            attendance
        WHERE 
            MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())
        GROUP BY 
            day
        ORDER BY 
            day
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok', data: result });
        }
    });
});


// get the yearly attendance data 
router.get('/yearly_attendance', (req, res) => {
    const query = `
        SELECT 
            MONTHNAME(date) as month, COUNT(*) as attendance_count
        FROM 
            attendance
        WHERE 
            YEAR(date) = YEAR(CURDATE())
        GROUP BY 
            month
        ORDER BY 
            FIELD(month, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December')
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok', data: result });
        }
    });
});



//route for the payroll table
router.get('/payroll', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const query = `
        SELECT payroll.*, employees.name, employees.avatar
        FROM payroll 
        INNER JOIN employees ON payroll.employee_id = employees.employee_id
        LIMIT ? OFFSET ?
    `;

    db.query(query, [limit, offset], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok', data: result });
        }
    });
});

router.get('/payroll/:id', (req, res) => {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const countQuery = 'SELECT COUNT(*) as total FROM payroll WHERE employee_id = ?';
    const dataQuery = `
        SELECT payroll.*, employees.name, employees.avatar
        FROM payroll 
        INNER JOIN employees ON payroll.employee_id = employees.employee_id
        WHERE payroll.employee_id = ?
        LIMIT ? OFFSET ?
    `;

    db.query(countQuery, [id], (err, countResult) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            const total = countResult[0].total;
            const totalPages = Math.ceil(total / limit);

            db.query(dataQuery, [id, limit, offset], (err, dataResult) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ status: 'error' });
                } else {
                    res.status(200).json({
                        status: 'ok',
                        data: dataResult,
                        currentPage: page,
                        totalPages: totalPages,
                        isLastPage: page === totalPages,
                        total
                    });
                }
            });
        }
    });
});

router.delete('/payroll/:id', (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM payroll WHERE id = ?', [id], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok' });
            if (req.io) {
                req.io.emit('payrollUpdate', { message: 'Payroll data updated' });
            } else {
                console.error('Socket.io instance not found');
            }
        }
    });
})


//route for attendance
router.get('/attendances', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const countQuery = 'SELECT COUNT(*) as total FROM attendance';
    const dataQuery = `
    SELECT attendance.*, employees.name, employees.avatar
    FROM attendance 
    INNER JOIN employees ON attendance.employee_id = employees.employee_id
    ORDER BY attendance.date DESC
    LIMIT ? OFFSET ?
`;

    db.query(countQuery, (err, countResult) => {
        if (err) {
            res.status(500).json({ status: 'error' });
        } else {
            const total = countResult[0].total;
            const totalPages = Math.ceil(total / limit);

            db.query(dataQuery, [limit, offset], (err, dataResult) => {
                if (err) {
                    res.status(500).json({ status: 'error' });
                } else {
                    res.status(200).json({
                        status: 'ok',
                        data: dataResult,
                        currentPage: page,
                        totalPages: totalPages,
                        isLastPage: page === totalPages
                    });
                }
            });
        }
    });
});

router.get('/attendance', (req, res) => {
    db.query('SELECT * FROM attendance', (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            console.error(result);
            res.status(200).json({ status: 'ok', data: result });
        }
    });
})

router.get('/attendance/:id', (req, res) => {
    const { id } = req.params;
    const currentDate = new Date().toISOString().split('T')[0]; // Get current date in yyyy-mm-dd format

    const query = `SELECT * FROM attendance WHERE employee_id = ? AND DATE(date) = ?`;

    db.query(query, [id, currentDate], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            console.log(results)
            res.status(200).json({ status: 'ok', data: results });
        }
    });
});


router.delete('/attendance/:id', (req, res) => {
    const { id } = req.params

    db.query('DELETE FROM attendance WHERE id = ?', [id], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok' });
            if (req.io) {
                req.io.emit('attendanceUpdate', { message: 'Attendance data updated' });
            } else {
                console.error('Socket.io instance not found');
            }
        }
    })
})


//Leave request route
router.post('/leave_request', (req, res) => {
    const { leaveType, startDate, endDate, reason } = req.body;
    const { employee_id } = req.user

    if (!req.user) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    if (!leaveType && !startDate && !endDate) return res.status(400).json({ status: 'error', message: 'leaveType, startDate and endDate are required' });

    const query = 'INSERT INTO leaveRequest (employee_id, leave_type, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)';
    const values = [employee_id, leaveType, new Date(startDate), new Date(endDate), reason];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error', message: 'Database error' });
        } else {
            res.status(200).json({ status: 'ok', message: 'Leave request submitted successfully' });
            if (req.io) {
                req.io.emit('leaveRequestUpdate', { message: 'Leave Request data updated' });
            } else {
                console.error('Socket.io instance not found');
            }
        }
    });
});

router.get('/leave_request', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const countQuery = 'SELECT COUNT(*) as total FROM leaveRequest';
    const dataQuery = `
        SELECT leaveRequest.*, employees.name, employees.avatar
        FROM leaveRequest 
        INNER JOIN employees ON leaveRequest.employee_id = employees.employee_id
        ORDER BY leaveRequest.created_at DESC
        LIMIT ? OFFSET ?
    `;


    db.query(countQuery, (err, countResult) => {
        if (err) {
            console.error('Error executing count query:', err);
            res.status(500).json({ status: 'error', message: 'Database error' });
        } else {
            const total = countResult[0].total;
            const totalPages = Math.ceil(total / limit);

            // Adjust offset if it exceeds the total number of records
            const adjustedOffset = Math.min(offset, total - 1);
            db.query(dataQuery, [limit, adjustedOffset], (err, result) => {
                if (err) {
                    console.error('Error executing data query:', err);
                    res.status(500).json({ status: 'error', message: 'Database error' });
                } else {
                    res.status(200).json({
                        status: 'ok',
                        data: result,
                        currentPage: page,
                        totalPages: totalPages,
                        isLastPage: page === totalPages
                    });
                }
            });
        }
    });
});

router.put('/leave_request/:id/status', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    console.log('Server-side:', id, req.body);

    // Ensure leaveRequestStatus is defined and contains the expected values
    const leaveRequestStatus = {
        PENDING: 'Pending',
        PROCESS: 'Process',
        APPROVED: 'Approved',
        REJECTED: 'Rejected'
    };

    if (!Object.values(leaveRequestStatus).includes(status)) {
        return res.status(400).json({ status: 'error', message: 'Invalid status' });
    }

    const query = 'UPDATE leaveRequest SET status = ? WHERE id = ?';
    const values = [status, id];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error', message: 'Database error' });
        } else {
            res.status(200).json({ status: 'ok', message: 'Leave request status updated successfully' });
            if (req.io) {
                req.io.emit('leaveRequestUpdate', { message: 'Leave Request data updated' });
            } else {
                console.error('Socket.io instance not found');
            }
        }
    });
});

router.get('/user_request', (req, res) => {
    const { employee_id } = req.user
    if (!employee_id) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    const q = 'SELECT * FROM leaveRequest WHERE employee_id = ?';
    db.query(q, [employee_id], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error', message: 'Database error' });
        } else {
            res.status(200).json({ status: 'ok', data: result });

        }
    });
})


router.get('/get-users', (req, res) => {
    const limit = Math.max(1, parseInt(req.query.limit) || 10); // Ensure limit is at least 1

    db.query('SELECT COUNT(*) as total FROM user', (err, countResult) => {
        if (err) {
            console.error('Error executing count query:', err);
            return res.status(500).json({ status: 'error', message: 'Database error' });
        }

        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        // Adjust the page to not exceed total pages
        const page = Math.min(Math.max(1, parseInt(req.query.page) || 1), totalPages);
        const offset = (page - 1) * limit;

        console.log(`Total records: ${total}, Total pages: ${totalPages}, Limit: ${limit}, Offset: ${offset}`);

        db.query('SELECT * FROM user LIMIT ? OFFSET ?', [limit, offset], (err, result) => {
            if (err) {
                console.error('Error executing data query:', err);
                return res.status(500).json({ status: 'error', message: 'Database error' });
            }

            res.status(200).json({
                status: 'ok',
                data: result,
                currentPage: page,
                totalPages: totalPages,
                isLastPage: page === totalPages
            });
        });
    });
});

router.delete('/delete-user/:id', (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: 'error', message: 'User ID is required' });
    db.query('DELETE FROM user WHERE user_id = ?', [id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ status: 'error', message: 'Database error' });
        }

        res.status(200).json({ status: 'ok', message: 'User deleted successfully' });
    });
});



router.get('/test', async (req, res) => {
    const employee = await prisma.employees.findMany()
    if (employee) {
        res.status(200).json({ status: 'ok', data: employee });
    } else {
        res.status(404).json({ status: 'not found' });
    }
})



module.exports = router;
