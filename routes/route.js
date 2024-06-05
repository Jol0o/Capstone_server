const express = require('express');
const db = require('../db');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const sendEmail = require('../email_template/sendEmail');


router.get('/hello', (req, res) => {
    res.send({ express: 'Hello From Express' });
});

router.post('/create_employee', [
    // ... other validations ...
    check('phone_number').isLength({ min: 11, max: 11 }).withMessage('Phone number must be exactly 11 digits'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { employee_id, name, email, salary_date, department, position, qrcode, phone_number, salary, password } = req.body;

    const query = `INSERT INTO employees (employee_id, name, email, salary_date, department, position, qrcode, phone_number, salary, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(query, [employee_id, name, email, salary_date, department, position, qrcode, phone_number, salary, password], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok' });
        }
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


router.post('/time_in', (req, res) => {
    const { employee_id, attendance_id } = req.body;
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];

    const time_in = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (!employee_id) {
        return res.status(400).json({ status: 'error', message: 'employee_id is required' });
    }

    const query = `INSERT INTO attendance (employee_id, time_in , date , attendance_id) VALUES (?,?,?, ?)`;

    db.query(query, [employee_id, time_in, currentDate, attendance_id], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok' });
        }
    });
});

router.put('/time_out/:id', (req, res) => {
    const { id } = req.params;
    const { time_in } = req.body;

    if (!time_in) {
        return res.status(400).json({ status: 'error', message: 'time_in is required' });
    }

    const now = new Date();
    const time_out = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Helper function to parse time string in 'HH:MM AM/PM' format
    const parseTime = (timeString) => {
        const [time, modifier] = timeString.split(' ');
        let [hours, minutes] = time.split(':');

        if (hours === '12') {
            hours = '00';
        }

        if (modifier === 'PM') {
            hours = parseInt(hours, 10) + 12;
        }

        const currentDate = new Date().toISOString().split('T')[0];
        return new Date(`${currentDate}T${hours}:${minutes}:00`);
    };

    const timeInDate = parseTime(time_in);
    const timeOutDate = now;

    const diffInMilliseconds = timeOutDate - timeInDate;
    const hours = Math.round(diffInMilliseconds / (1000 * 60 * 60)); // Convert milliseconds to hours


    const query = `UPDATE attendance SET time_out = ?, hours = ? WHERE attendance_id = ?`;

    db.query(query, [time_out, hours, id], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok' });
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
    db.query('SELECT * FROM employees WHERE email = ?', [email], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok', data: result });
        }
    });
})

router.get('/employees/:name', (req, res) => {
    const { name } = req.params;
    db.query('SELECT * FROM employees WHERE name = ?', [name], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else if (result.length > 0) {
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

            res.status(200).json({ status: 'ok', data: result });
        }
    });
});

router.put('/employees/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, salary_date, department, position, qrcode, phone_number, password, salary, avatar } = req.body;
    db.query(
        'UPDATE employees SET name = ?, email = ?, password = ?, salary_date = ?, department = ?, position = ?, phone_number = ?, salary = ?, qrcode = ?, avatar = ? WHERE id = ?',
        [name, email, password, salary_date, department, position, phone_number, salary, qrcode, avatar || null, id],
        (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).json({ status: 'error' });
            } else {
                res.status(200).json({ status: 'ok', data: result });
            }
        }
    );
});


router.delete('/employee/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM attendance WHERE employee_id = ?', [id], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            db.query('DELETE FROM payroll WHERE employee_id = ?', [id], (err, result) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ status: 'error' });
                } else {
                    db.query('DELETE FROM sms_notifications WHERE employee_id = ?', [id], (err, result) => {
                        if (err) {
                            console.error(err);
                            res.status(500).json({ status: 'error' });
                        } else {
                            db.query('DELETE FROM employees WHERE employee_id = ?', [id], (err, result) => {
                                if (err) {
                                    console.error(err);
                                    res.status(500).json({ status: 'error' });
                                } else {
                                    res.status(200).json({ status: 'ok' });
                                }
                            });
                        }
                    });
                }
            });
        }
    });
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

router.delete('/payroll/:id', (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM payroll WHERE id = ?', [id], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            res.status(200).json({ status: 'ok' });
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
        }
    })
})




module.exports = router;
