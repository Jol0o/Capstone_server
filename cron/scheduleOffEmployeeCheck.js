const cron = require("node-cron");
const db = require("../db");
const moment = require('moment-timezone');
const nodemailer = require('nodemailer');
require("dotenv").config();


if (!db) {
    console.error("Database connection not established");
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", // Corrected SMTP host
    port: 465, // Use port 465 for secure connection
    secure: true, // Use `true` for port 465
    auth: {
        user: process.env.EMAIL,
        pass: process.env.APP_PASSWORD, // Use app password if 2FA is enabled
    }, tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
    }
});

const sendMails = (to, subject, text) => {
    const mailOptions = {
        from: process.env.EMAIL,
        to,
        subject,
        text
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
};


const checkAndUpdateDayOff = () => {
    const currentDate = moment().tz('Asia/Manila').format('YYYY-MM-DD');
    const yesterdayDate = moment().tz('Asia/Manila').subtract(1, 'days').format('YYYY-MM-DD');
    console.log(`Checking for leave requests on ${currentDate}`);

    // Check for leave requests with inclusive_dates as current date and status 'Approved'
    const q = 'SELECT * FROM leaveRequest WHERE status = ?';
    db.query(q, ['Approved'], (err, result) => {
        if (err) {
            console.error("Database query error:", err);
        } else {
            console.log(result);
            if (result.length > 0) {
                // Filter results by checking the inclusive_dates with currentDate
                const filteredResults = result.filter(row => {
                    const inclusiveDate = moment(row.inclusive_dates).format('YYYY-MM-DD');
                    return inclusiveDate === currentDate;
                });
    
                filteredResults.forEach((row) => {
                    const q = 'UPDATE employees SET day_off = ? WHERE employee_id = ?';
                    db.query(q, [true, row.employee_id], (err, result) => {
                        if (err) {
                            console.error("Database query error:", err);
                        } else {
                            console.log(`Employee ${row.employee_id} has been checked off`);

                            const subject = 'Leave Request Rejected';
                            const text = `Dear ${name},\n\nYou are off on ${row.inclusive_dates.toLocaleDateString()} to ${row.to_date.toLocaleDateString()}. Enjoy your day off!\n\nBest regards,\nYour Company`;
                            sendMails(row.email, subject, text);
    
                            // Update totalSalary if withpay is true
                            if (row.withpay) {
                                db.query('SELECT basicSalary FROM employees WHERE employee_id = ?', [row.employee_id], (err, salaryResult) => {
                                    if (err) {
                                        console.error("Database query error:", err);
                                    } else {
                                        const basicSalary = salaryResult[0].basicSalary;
                                        const additionalSalary = basicSalary * row.days_requested;
    
                                        db.query('UPDATE employees SET totalSalary = totalSalary + ? WHERE employee_id = ?', [additionalSalary, row.employee_id], (err) => {
                                            if (err) {
                                                console.error("Database query error:", err);
                                            } else {
                                                console.log(`Employee ${row.employee_id} totalSalary updated with additional ${additionalSalary}`);
                                            }
                                        });
                                    }
                                });
                            }
                        }
                    });
                });
            }
        }
    });

    // Check for leave requests with to_date as yesterday and status 'Approved'
    const q2 = 'SELECT * FROM leaveRequest WHERE status = ?';
    db.query(q2, ['Approved'], (err, result) => {
        if (err) {
            console.error("Database query error:", err);
        } else {
            if (result.length > 0) {
                // Filter results by checking the to_date with yesterdayDate
                const filteredResults = result.filter(row => {
                    const toDate = moment(row.to_date).format('YYYY-MM-DD');
                    return toDate === yesterdayDate;
                });

                filteredResults.forEach((row) => {
                    const q = 'UPDATE employees SET day_off = ? WHERE employee_id = ?';
                    db.query(q, [false, row.employee_id], (err, result) => {
                        if (err) {
                            console.error("Database query error:", err);
                        } else {
                            console.log(`Employee ${row.employee_id} has been checked on`);

                            // Update the leave request status to Done
                            const qUpdateStatus = 'UPDATE leaveRequest SET status = ? WHERE id = ?';
                            db.query(qUpdateStatus, ['Done', row.id], (err, result) => {
                                if (err) {
                                    console.error("Database query error:", err);
                                } else {
                                    console.log(`Leave request ${row.id} status updated to Done`);
                                }
                            });
                        }
                    });
                });
            }
        }
    });

    // Check for leave requests with inclusive_dates and to_date as current date and status 'Approved'
    const q3 = 'SELECT * FROM leaveRequest WHERE status = ?';
    db.query(q3, ['Approved'], (err, result) => {
        if (err) {
            console.error("Database query error:", err);
        } else {
            if (result.length > 0) {
                // Filter results by checking both inclusive_dates and to_date with currentDate
                const filteredResults = result.filter(row => {
                    const inclusiveDate = moment(row.inclusive_dates).format('YYYY-MM-DD');
                    const toDate = moment(row.to_date).format('YYYY-MM-DD');
                    return inclusiveDate === currentDate && toDate === currentDate;
                });

                filteredResults.forEach((row) => {
                    const q = 'UPDATE employees SET day_off = ? WHERE employee_id = ?';
                    db.query(q, [true, row.employee_id], (err, result) => {
                        if (err) {
                            console.error("Database query error:", err);
                        } else {
                            console.log(`Employee ${row.employee_id} has been checked off for today`);
                        }
                    });
                });
            }
        }
    });

    const q4 = 'SELECT * FROM leaveRequest WHERE status = ?';
    db.query(q4, ['Pending'], (err, result) => {
        if (err) {
            console.error("Database query error:", err);
        } else {
            if (result.length > 0) {
                // Filter results by checking the inclusive_dates with currentDate
                const filteredResults = result.filter(row => {
                    const inclusiveDate = moment(row.inclusive_dates).format('YYYY-MM-DD');
                    return inclusiveDate < currentDate;
                });

                filteredResults.forEach((row) => {
                    const q = 'UPDATE leaveRequest SET status = ? WHERE id = ?';
                    db.query(q, ['Rejected', row.id], (err, result) => {
                        if (err) {
                            console.error("Database query error:", err);
                        } else {
                            console.log(`Leave request ${row.id} has been automatically rejected`);

                            const subject = 'Leave Request Rejected';
                            const text = `Dear ${row.name},\n\nYour leave request for the dates ${row.inclusive_dates} has been automatically rejected.\n\nBest regards,\nYour Company`;
                            sendMails(row.email, subject, text);
                        }
                    });
                });
            }
        }
    });
};

// Schedule the task to run every 5 minutes
cron.schedule('0 * * * *', () => {
    console.log('Running day off check task...');
    checkAndUpdateDayOff();
}, {
    scheduled: true,
    timezone: 'Asia/Manila'
});

module.exports = checkAndUpdateDayOff;