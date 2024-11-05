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
const { Parser } = require('json2csv');

const LeaveRequestStatus = {
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
    check('department').notEmpty().withMessage('Department is required'),
    check('position').notEmpty().withMessage('Position is required'),
    check('qrcode').notEmpty().withMessage('QR code is required'),
    check('phone_number').isLength({ min: 11, max: 11 }).withMessage('Phone number must be exactly 11 digits'),
    check('baseSalary').matches(/^[1-9]\d*$/).withMessage('Base salary must not start with 0'),
    check('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { employee_id, name, email, department, position, qrcode, phone_number, baseSalary, password, day_off, avatar, hierarchy } = req.body;

    try {
        // Check if an employee with the same email or phone number already exists
        const existingEmployee = await prisma.employees.findFirst({
            where: {
                OR: [
                    { email: email },
                    { phone_number: phone_number }
                ]
            }
        });

        if (existingEmployee) {
            return res.status(400).json({ status: 'error', message: 'Email or phone number already exists' });
        }

        // Hash the password
        const hashedPassword = await hashPassword(password);

        // Create a new employee
        const newEmployee = await prisma.employees.create({
            data: {
                employee_id,
                name,
                email,
                department,
                position,
                qrcode,
                phone_number,
                baseSalary: parseInt(baseSalary, 10),
                totalSalary: 0, // Set total salary to 0 initially
                password: hashedPassword,
                hierarchy: hierarchy || 'employee',
                day_off: day_off || false,
                avatar: avatar || null
            }
        });

        // Send email with QR code
        await sendEmail(email, qrcode);

        res.status(200).json({ status: 'ok', data: newEmployee });
        if (req.io) {
            req.io.emit('employeeDataUpdate', { message: 'Employee data updated' });
        } else {
            console.error('Socket.io instance not found');
        }
    } catch (err) {
        if (err.code === 'P2002') { // Prisma unique constraint violation
            const field = err.meta.target.split('_')[1]; // Assuming the field name is after the first underscore
            return res.status(400).json({ status: 'error', message: `Duplicate entry detected for ${field}. Please check the ${field} field.` });
        } else {
            console.error(err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }
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


router.put('/time_out/:id', async (req, res) => {
    const { id } = req.params;
    const now = moment().tz('Asia/Manila');
    const time_out = now.format('hh:mm A'); // Getting the current time as time_out

    try {
        // Fetch the attendance record
        const attendanceQuery = `
            SELECT attendance.*, employees.hierarchy, employees.baseSalary
            FROM attendance
            JOIN employees ON attendance.employee_id = employees.employee_id
            WHERE attendance.attendance_id = ?
        `;
        db.query(attendanceQuery, [id], (err, attendanceResult) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ status: 'error', message: 'Server error' });
            }

            if (attendanceResult.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Attendance record not found' });
            }

            const attendanceRecord = attendanceResult[0];
            const { time_in, hierarchy, baseSalary, time_out: existingTimeOut } = attendanceRecord;

            // Check if time_out already has a value
            if (existingTimeOut) {
                return res.status(400).json({ status: 'error', message: 'Time out already set' });
            }

            // Ensure baseSalary is a valid number
            if (!baseSalary || isNaN(baseSalary)) {
                return res.status(400).json({ status: 'error', message: 'Invalid base salary' });
            }

            // Ensure time_in is a valid value
            if (!time_in) {
                return res.status(400).json({ status: 'error', message: 'Missing time_in value' });
            }

            // Parse time_in and time_out
            const parseTime = (time, date) => {
                return moment.tz(`${date} ${time}`, 'YYYY-MM-DD hh:mm A', 'Asia/Manila');
            };

            const timeInDate = parseTime(time_in, attendanceRecord.date);
            const timeOutDate = parseTime(time_out, now.format('YYYY-MM-DD'));

            // Ensure time_out is after time_in, adjust if necessary
            if (timeOutDate.isBefore(timeInDate)) {
                timeOutDate.add(1, 'day');
            }

            // Calculate the difference in milliseconds
            const diffInMilliseconds = timeOutDate.diff(timeInDate);
            const diffInHours = diffInMilliseconds / (1000 * 60 * 60);

            // Validate the time difference
            if (isNaN(diffInHours) || diffInHours <= 0) {
                return res.status(400).json({ status: 'error', message: 'Invalid time difference' });
            }

            // Calculate salary deduction if hierarchy is "Rank & File"
            let salaryDeduction = 0;
            let dailySalary = 0;
            let overtimePay = 0;

            if (hierarchy === 'Rank & File' && baseSalary) {
                const hourlyRate = baseSalary / 8;

                // Avoid negative deduction for short work durations
                if (diffInHours < 8 && diffInHours >= 1) {
                    salaryDeduction = hourlyRate * (8 - diffInHours);
                    dailySalary = hourlyRate * diffInHours;
                } else if (diffInHours >= 8) {
                    const regularHours = 8;
                    const overtimeHours = diffInHours - regularHours;
                    dailySalary = hourlyRate * regularHours;
                    overtimePay = hourlyRate * 1.3 * overtimeHours;
                } else {
                    // Edge case: very short work duration, handle as zero salary earned
                    dailySalary = 0;
                    salaryDeduction = 0;
                    overtimePay = 0;
                }
            }

            // Ensure all values are valid numbers
            dailySalary = isNaN(dailySalary) ? 0 : dailySalary;
            overtimePay = isNaN(overtimePay) ? 0 : overtimePay;
            salaryDeduction = isNaN(salaryDeduction) ? 0 : salaryDeduction;

            // Update the employee's total salary
            const updateSalaryQuery = `
                UPDATE employees
                SET totalSalary = totalSalary + ?
                WHERE employee_id = ?
            `;
            db.query(updateSalaryQuery, [dailySalary + overtimePay - salaryDeduction, attendanceRecord.employee_id], (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ status: 'error', message: 'Failed to update employee salary' });
                }

                // Update the attendance record
                const updateAttendanceQuery = `
                    UPDATE attendance
                    SET time_out = ?, hours = ?
                    WHERE attendance_id = ?
                `;
                db.query(updateAttendanceQuery, [time_out, diffInHours, id], (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ status: 'error', message: 'Failed to update attendance' });
                    }

                    res.status(200).json({
                        status: 'ok',
                        hoursWorked: diffInHours,
                        salaryDeduction,
                        overtimePay,
                        totalSalary: dailySalary + overtimePay - salaryDeduction
                    });

                    if (req.io) {
                        req.io.emit('attendanceUpdate', { message: 'Employee data updated' });
                    } else {
                        console.error('Socket.io instance not found');
                    }
                });
            });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
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
    check('department').notEmpty().withMessage('Department is required'),
    check('position').notEmpty().withMessage('Position is required'),
    check('qrcode').notEmpty().withMessage('QR code is required'),
    check('phone_number').isLength({ min: 11, max: 11 }).withMessage('Phone number must be exactly 11 digits'),
    check('baseSalary').matches(/^[1-9]\d*$/).withMessage('Salary must not start with 0'),
], async (req, res) => {
    const { id } = req.params;
    const { name, email, department, position, qrcode, phone_number, password, baseSalary, avatar, hierarchy, day_off } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    let hashedPassword = password;

    try {
        // Fetch existing employee data
        const existingEmployee = await prisma.employees.findUnique({
            where: { id: parseInt(id, 10) }
        });

        if (!existingEmployee) {
            return res.status(404).json({ status: 'error', message: 'Employee not found' });
        }

        // Hash password if provided and different from the existing one
        if (password && password !== existingEmployee.password) {
            hashedPassword = await hashPassword(password);
            await prisma.user.update({
                where: { user_id: existingEmployee.employee_id },
                data: { password: hashedPassword }
            });
        } else {
            hashedPassword = existingEmployee.password;
        }

        // Convert salary_date to the correct format
        // Update employee data
        const updatedEmployee = await prisma.employees.update({
            where: { id: parseInt(id, 10) },
            data: {
                name,
                email,
                password: hashedPassword,
                department,
                position,
                phone_number,
                baseSalary: parseInt(baseSalary, 10),
                qrcode,
                avatar: avatar || null,
                hierarchy: hierarchy || 'employee',
                day_off: day_off || false
            }
        });

        // Check if the email has changed and update the user table
        if (email && email !== existingEmployee.email) {
            await prisma.user.update({
                where: { user_id: existingEmployee.employee_id },
                data: { email }
            });
        }

        res.status(200).json({ status: 'ok', data: updatedEmployee });
        if (req.io) {
            req.io.emit('employeeDataUpdate', { message: 'Employee data updated' });
        } else {
            console.error('Socket.io instance not found');
        }
    } catch (err) {
        if (err.code === 'P2002') { // Prisma unique constraint violation
            const field = err.meta.target.split('_')[1]; // Assuming the field name is after the first underscore
            return res.status(400).json({ status: 'error', message: `Duplicate entry detected for ${field}. Please check the ${field} field.` });
        } else {
            console.error(err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }
});


router.delete('/employee/:id', async (req, res) => {
    const { id } = req.params;

    try {
        db.query('DELETE FROM attendance WHERE employee_id = ?', [id]);
        db.query('DELETE FROM payroll WHERE employee_id = ?', [id]);
        db.query('DELETE FROM smsnotification WHERE employee_id = ?', [id]);
        db.query('DELETE FROM employees WHERE employee_id = ?', [id]);

        db.query('DELETE FROM user WHERE employee_id = ?', [id]);

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
            COUNT(CASE WHEN STR_TO_DATE(time_out, '%h:%i %p') < '19:00:00' AND DATE(date) = CURDATE() AND time_out != '' THEN 1 END) AS count_today,
            COUNT(CASE WHEN STR_TO_DATE(time_out, '%h:%i %p') < '19:00:00' AND DATE(date) = CURDATE() - INTERVAL 1 DAY AND time_out != '' THEN 1 END) AS count_yesterday
        FROM 
            attendance
        WHERE 
            (DATE(date) = CURDATE() OR DATE(date) = CURDATE() - INTERVAL 1 DAY) AND time_out != '';
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
            (SELECT COUNT(*) FROM employees LEFT JOIN attendance ON employees.employee_id = attendance.employee_id AND DATE(attendance.date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE attendance.employee_id IS NULL AND employees.day_off = false) as count_yesterday,
            (SELECT GROUP_CONCAT(employees.name SEPARATOR ', ') FROM employees LEFT JOIN attendance ON employees.employee_id = attendance.employee_id AND DATE(attendance.date) = CURDATE() WHERE attendance.employee_id IS NULL AND employees.day_off = false) as absent_today
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            if (result.length > 0) {
                const difference = result[0].count_today - result[0].count_yesterday;
                const absentToday = result[0].absent_today ? result[0].absent_today.split(', ') : [];
                res.status(200).json({
                    status: 'ok',
                    data: {
                        today: result[0].count_today,
                        yesterday: result[0].count_yesterday,
                        difference: difference,
                        absentToday: absentToday
                    }
                });
            } else {
                res.status(200).json({
                    status: 'ok',
                    data: {
                        today: 0,
                        yesterday: 0,
                        difference: 0,
                        absentToday: []
                    }
                });
            }
        }
    });
});

//get the employees who are on their day off
router.get('/off', (req, res) => {
    const query = `
        SELECT 
            employees.name,
            leaveRequest.inclusive_dates,
            leaveRequest.to_date
        FROM 
            employees
        JOIN 
            leaveRequest ON employees.employee_id = leaveRequest.employee_id
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
});


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

    const countQuery = 'SELECT COUNT(*) as total FROM payroll';
    const dataQuery = `
        SELECT payroll.*, employees.name, employees.avatar
        FROM payroll 
        INNER JOIN employees ON payroll.employee_id = employees.employee_id
        LIMIT ? OFFSET ?
    `;

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
                        isLastPage: page === totalPages,
                        total
                    });
                }
            });
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


router.get('/user-attendance/:id', (req, res) => {
    const { id } = req.params;

    const attendanceQuery = `
        SELECT 
            attendance.employee_id, 
            attendance.date, 
            attendance.time_in,
            attendance.time_out,
            DAYNAME(attendance.date) as day
        FROM 
            attendance
        WHERE 
            attendance.employee_id = ?
        ORDER BY 
            attendance.date
    `;

    const leaveRequestQuery = `
        SELECT 
            inclusive_dates, 
            to_date, 
            status 
        FROM 
            leaveRequest 
        WHERE 
            employee_id = ? 
            AND status IN ('Done', 'Approved')
    `;

    db.query(attendanceQuery, [id], (err, attendanceResult) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ status: 'error' });
        }

        db.query(leaveRequestQuery, [id], (err, leaveRequestResult) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ status: 'error' });
            }

            const attendanceData = [];
            let previousDate = null;
            const today = moment().tz('Asia/Manila').startOf('day');

            // Map leave dates with their inclusive date ranges for easier checking
            const leaveDates = leaveRequestResult.flatMap(leave => {
                let datesInRange = [];
                let start = moment(leave.inclusive_dates).tz('Asia/Manila');
                const end = moment(leave.to_date).tz('Asia/Manila');
                while (start.isSameOrBefore(end, 'day')) {
                    datesInRange.push({
                        date: start.clone().format('YYYY-MM-DD'),
                        inclusive_dates: leave.inclusive_dates,
                        to_date: leave.to_date,
                        status: 'off duty'
                    });
                    start.add(1, 'day');
                }
                return datesInRange;
            });

            // Function to get leave data for a specific date
            const getLeaveDataForDate = (date) => {
                return leaveDates.find(leave => leave.date === date);
            };

            attendanceResult.forEach(record => {
                const currentDate = moment(record.date).tz('Asia/Manila');
                const timeIn = moment.tz(`${record.date} ${record.time_in}`, 'YYYY-MM-DD hh:mm A', 'Asia/Manila');
                const eightAM = moment.tz(`${record.date} 08:00 AM`, 'YYYY-MM-DD hh:mm A', 'Asia/Manila');

                // Initialize status as "absent"
                let status = 'absent';

                // Check if the current date falls within any leave request period
                const leaveData = getLeaveDataForDate(currentDate.format('YYYY-MM-DD'));

                if (leaveData) {
                    status = 'off duty';
                } else if (record.time_in) {
                    // If the employee has a time-in record, adjust status accordingly
                    status = timeIn.isBefore(eightAM) ? 'present' : 'late';
                }

                // Check for gaps in dates and add "absent" status for missing dates
                if (previousDate) {
                    const diffDays = currentDate.diff(previousDate, 'days');
                    for (let i = 1; i < diffDays; i++) {
                        const missingDate = previousDate.clone().add(i, 'days');
                        const missingLeaveData = getLeaveDataForDate(missingDate.format('YYYY-MM-DD'));
                        attendanceData.push({
                            employee_id: record.employee_id,
                            date: missingDate.format('YYYY-MM-DD'),
                            day: missingDate.format('dddd'),
                            status: missingLeaveData ? 'off duty' : 'absent',
                            inclusive_dates: missingLeaveData ? missingLeaveData.inclusive_dates : null,
                            to_date: missingLeaveData ? missingLeaveData.to_date : null,
                            leave_status: missingLeaveData ? missingLeaveData.status : null
                        });
                    }
                }

                // Add the current record with determined status
                attendanceData.push({
                    employee_id: record.employee_id,
                    date: record.date,
                    day: record.day,
                    status: status,
                    time_in: record.time_in,
                    time_out: record.time_out,
                    inclusive_dates: leaveData ? leaveData.inclusive_dates : null,
                    to_date: leaveData ? leaveData.to_date : null,
                    leave_status: leaveData ? leaveData.status : null
                });

                previousDate = currentDate;
            });

            // Add "absent" entries for dates after the last attendance record up to today
            if (previousDate) {
                let nextDate = previousDate.clone().add(1, 'days');
                while (nextDate.isBefore(today) || nextDate.isSame(today, 'day')) {
                    const nextLeaveData = getLeaveDataForDate(nextDate.format('YYYY-MM-DD'));
                    attendanceData.push({
                        employee_id: id,
                        date: nextDate.format('YYYY-MM-DD'),
                        day: nextDate.format('dddd'),
                        status: nextLeaveData ? 'off duty' : 'absent',
                        inclusive_dates: nextLeaveData ? nextLeaveData.inclusive_dates : null,
                        to_date: nextLeaveData ? nextLeaveData.to_date : null,
                        leave_status: nextLeaveData ? nextLeaveData.status : null
                    });
                    nextDate.add(1, 'days');
                }
            }

            res.status(200).json({ status: 'ok', data: attendanceData });
        });
    });
});





router.get('/attendance/:id', (req, res) => {
    const { id } = req.params;
    console.log(id);

    // Get current date in Manila time zone in yyyy-mm-dd format
    const currentDate = moment().tz('Asia/Manila').format('YYYY-MM-DD');
    console.log(currentDate);

    const query = `SELECT * FROM attendance WHERE employee_id = ? AND DATE(date) = ?`;

    db.query(query, [id, currentDate], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ status: 'error' });
        } else {
            console.log(results);
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
router.post('/leave_request', [
    check('leaveType').notEmpty().withMessage('Leave type is required'),
    check('reason').notEmpty().withMessage('Reason is required'),
    check('daysRequested').isInt({ min: 1 }).withMessage('Days requested must be at least 1'),
    check('department').notEmpty().withMessage('Department is required'),
    check('distributionCopy').isObject().withMessage('Distribution copy must be an object'),
    check('email').isEmail().withMessage('Valid email is required'),
    check('inclusiveDates').notEmpty().withMessage('Inclusive dates are required').isISO8601().withMessage('Inclusive dates must be a valid date'),
    check('name').notEmpty().withMessage('Name is required').matches(/^[a-zA-Z\s.]+$/).withMessage('Name must not contain special characters except for periods'),
    check('personToTakeover').notEmpty().withMessage('Person to take over is required'),
    check('position').notEmpty().withMessage('Position is required'),
    check('requestedBy').notEmpty().withMessage('Requested by is required'),
    check('supportingDocument').notEmpty().withMessage('Supporting document is required'),
    check('toDate').notEmpty().withMessage('To date is required').isISO8601().withMessage('To date must be a valid date')
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const {
        leaveType,
        reason,
        daysRequested,
        department,
        distributionCopy,
        email,
        inclusiveDates,
        name,
        personToTakeover,
        position,
        requestedBy,
        supportingDocument,
        toDate
    } = req.body;
    const { employee_id } = req.user;

    if (!req.user) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    const query = `
        INSERT INTO leaveRequest (
            employee_id, leave_type, reason, days_requested, department, distribution_copy, email, inclusive_dates, name, person_to_takeover, position, requested_by, supporting_document, to_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )
    `;
    const values = [
        employee_id, leaveType, reason, daysRequested, department, JSON.stringify(distributionCopy), email, new Date(inclusiveDates), name, personToTakeover, position, requestedBy, supportingDocument, new Date(toDate)
    ];

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
    const offset = Math.max((page - 1) * limit, 0); // Ensure offset is not negative

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

            db.query(dataQuery, [limit, offset], (err, result) => {
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

    // Ensure LeaveRequestStatus is defined and contains the expected values
    const LeaveRequestStatus = {
        PENDING: 'Pending',
        PROCESS: 'Process',
        APPROVED: 'Approved',
        REJECTED: 'Rejected'
    };

    if (!Object.values(LeaveRequestStatus).includes(status)) {
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

router.delete('/leave_request/:id', (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: 'error', message: 'Leave request ID is required' });

    db.query('DELETE FROM leaveRequest WHERE id = ?', [id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ status: 'error', message: 'Database error' });
        }

        res.status(200).json({ status: 'ok', message: 'Leave request deleted successfully' });
    });
})

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
        const offset = Math.max(0, (page - 1) * limit); // Ensure offset is not negative

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

router.get('/employee-requests', async (req, res) => {
    const { page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    try {
        const totalRequests = await prisma.employeeRequest.count();
        const totalPages = Math.ceil(totalRequests / limitNumber);

        const employeeRequests = await prisma.employeeRequest.findMany({
            skip: (pageNumber - 1) * limitNumber || 0,
            take: limitNumber,
            orderBy: {
                id: 'asc'
            }
        });

        res.status(200).json({
            status: 'ok',
            data: employeeRequests,
            currentPage: pageNumber,
            totalPages: totalPages,
            isLastPage: pageNumber === totalPages
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
});

router.delete('/employee-requests/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const deletedRequest = await prisma.employeeRequest.delete({
            where: { id: parseInt(id, 10) }
        });
        res.status(200).json({
            status: 'ok',
            data: deletedRequest
        });
        if (req.io) {
            req.io.emit('employeeRequestUpdate', { message: 'employee Request data updated' });
        } else {
            console.error('Socket.io instance not found');
        }
    } catch (error) {
        console.error(error);
        if (error.code === 'P2025') { // Prisma record not found
            return res.status(404).json({ status: 'error', message: 'Employee request not found' });
        }
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
});



router.post('/employee-requests/:id/approve', [
    check('department').notEmpty().withMessage('Department is required'),
    check('position').notEmpty().withMessage('Position is required'),
    check('baseSalary').matches(/^[1-9]\d*$/).withMessage('Salary must not start with 0'),
    check('qrcode').notEmpty().withMessage('QR code is required'),
], async (req, res) => {
    const { id } = req.params;
    const { department, position, baseSalary, hierarchy, employee_id, qrcode } = req.body;

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        // Fetch the employee request
        const employeeRequest = await prisma.employeeRequest.findUnique({
            where: { id: parseInt(id, 10) }
        });

        if (!employeeRequest) {
            return res.status(404).json({ status: 'error', message: 'Employee request not found' });
        }

        // Check if an employee with the same email already exists
        const existingEmployee = await prisma.employees.findUnique({
            where: { email: employeeRequest.email }
        });

        if (existingEmployee) {
            return res.status(409).json({ status: 'error', message: 'Employee with this email already exists' });
        }

        // Update the status to confirmed
        const deletedRequest = await prisma.employeeRequest.delete({
            where: { id: parseInt(id, 10) }
        });

        // Create the employee record
        const newEmployee = await prisma.employees.create({
            data: {
                employee_id,
                name: employeeRequest.name,
                email: employeeRequest.email,
                phone_number: employeeRequest.phone_number,
                password: employeeRequest.password,
                created_at: new Date(),
                department: department || 'Default Department',
                position: position || 'Default Position',
                qrcode,
                avatar: '',
                baseSalary: parseInt(baseSalary, 10) || 0,
                totalSalary: 0,
                hierarchy: hierarchy || 'rank & file',
                day_off: false, // Ensure day_off is a boolean
            }
        });

        // Create the user record
        const newUser = await prisma.user.create({
            data: {
                user_id: newEmployee.employee_id,
                email: employeeRequest.email,
                password: employeeRequest.password,
                employee_id: newEmployee.employee_id
            }
        });

        await sendEmail(newEmployee.email, qrcode)

        if (req.io) {
            req.io.emit('employeeRequestUpdate', { message: 'Employee request data updated' });
            req.io.emit('employeeDataUpdate', { message: 'Employee data updated' });
        } else {
            console.error('Socket.io instance not found');
        }

        res.status(200).json({
            status: 'ok',
            data: {
                employee: newEmployee,
                user: newUser
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
});

router.get('/admins', (req, res) => {
    const limit = Math.max(1, parseInt(req.query.limit) || 15); // Ensure limit is at least 1

    db.query('SELECT COUNT(*) as total FROM admin', (err, countResult) => {
        if (err) {
            console.error('Error executing count query:', err);
            return res.status(500).json({ status: 'error', message: 'Database error' });
        }

        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        // Adjust the page to not exceed total pages
        const page = Math.min(Math.max(1, parseInt(req.query.page) || 1), totalPages);
        const offset = Math.max(0, (page - 1) * limit); // Ensure offset is not negative

        console.log(`Total records: ${total}, Total pages: ${totalPages}, Limit: ${limit}, Offset: ${offset}`);

        db.query('SELECT * FROM admin LIMIT ? OFFSET ?', [limit, offset], (err, results) => {
            if (err) {
                console.error('Error executing data query:', err);
                return res.status(500).json({ status: 'error', message: 'Database error' });
            }

            res.status(200).json({
                status: 'ok',
                data: results,
                currentPage: page,
                totalPages: totalPages,
                isLastPage: page === totalPages
            });
        });
    });
});

router.put('/admin/:id', [
    check('email').isEmail().withMessage('Invalid email address'),
    check('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { email, password } = req.body;
    if (!id) return res.status(404).json({ message: 'Id is required' });
    const hashedPassword = await hashPassword(password);

    const q = 'UPDATE admin SET email = ?, password = ? WHERE id = ?';

    db.query(q, [email, hashedPassword, id], (err) => {
        if (err) {
            return res.status(500).json({ message: 'Database error', error: err });
        } else {
            return res.status(200).json({ message: 'Successfully updated admin account!' });
        }
    });
});

router.delete('/admin/:id', (req, res) => {
    const { id } = req.params;

    if (!id) return res.status(404).json({ message: 'Id is required' });

    const q = 'DELETE FROM admin WHERE id = ?';

    db.query(q, [id], (err) => {
        if (err) {
            return res.status(500).json({ message: 'Database error', error: err });
        } else {
            return res.status(200).json({ message: 'Successfully deleted admin account!' });
        }
    });
});

router.get('/export/:table', (req, res) => {
    const { table } = req.params;

    if (!table) return res.status(400).json({ message: 'Table name is required' });

    const q = `SELECT * FROM ??`;

    db.query(q, [table], (err, result) => {
        if (err) {
            return res.status(500).json({ message: 'Database error', error: err });
        } else {
            if (result.length === 0) {
                return res.status(404).json({ message: 'No data found' });
            }

            const fields = Object.keys(result[0]);
            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(result);

            res.header('Content-Type', 'text/csv');
            res.attachment(`${table}.csv`);
            return res.send(csv);
        }
    });
});

module.exports = router;
