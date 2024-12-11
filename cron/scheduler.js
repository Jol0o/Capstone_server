const cron = require("node-cron");
const db = require("../db");
const { Vonage } = require('@vonage/server-sdk');
const moment = require('moment-timezone');
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
require("dotenv").config();

if (!db) {
    console.error("Database connection not established");
    process.exit(1);
}

const vonage = new Vonage({
    apiKey: process.env.VONAGE_KEY,
    apiSecret: process.env.VONAGE_SECRET
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.APP_PASSWORD,
    }, tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
    }
});

async function sendEmail(to, name, message, template) {
    const templatePath = path.join(__dirname, `../email_template/${template}.ejs`);
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    const html = ejs.render(templateContent, { email: to, name, message });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject: 'Your Monthly Payslip',
        html,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

function processPayroll() {
    console.log("Payroll processing started");
    const currentDate = moment().tz('Asia/Manila');
    const dayOfMonth = currentDate.date();
    const month = currentDate.month() + 1;
    const year = currentDate.year();
    let startDate, endDate;

    if (dayOfMonth <= 15) {
        startDate = moment().startOf('month').format('YYYY-MM-DD');
        endDate = moment().date(15).format('YYYY-MM-DD');
    } else {
        startDate = moment().date(16).format('YYYY-MM-DD');
        endDate = moment().endOf('month').format('YYYY-MM-DD');
    }

    // Add period_start and period_end to payroll entry
    db.query(
        `SELECT * FROM employees`,
        (err, result) => {
            if (err) {
                console.error("Database query error:", err);
            } else {
                result.forEach((row) => {
                    console.log('running payroll processing');
                    const number = row.phone_number;
                    let totalHours = 0;
                    const employee_id = row.employee_id;

                    function generateUUID() {
                        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                            const r = (Math.random() * 16) | 0,
                                v = c === 'x' ? r : (r & 0x3) | 0x8;
                            return v.toString(16);
                        });
                    }
                    const payroll_id = generateUUID();
                    const notification_id = generateUUID();

                    db.query(
                        `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
                        [employee_id, startDate, endDate],
                        (err, attendanceResult) => {
                            if (err) {
                                console.error("Database query error:", err);
                            } else {
                                totalHours = attendanceResult.reduce((total, attendance) => {
                                    console.log(`Attendance record: ${JSON.stringify(attendance)}`);
                                    if (attendance.hours < 0) {
                                        console.warn(`Negative hours detected for employee_id ${employee_id} on date ${attendance.date}: ${attendance.hours}`);
                                    }
                                    return total + Math.max(0, attendance.hours);
                                }, 0);

                                const rnfValue = [payroll_id, employee_id, totalHours, row.monthSalary];
                                const manegerialValue = [payroll_id, employee_id, totalHours, row.basicSalary];
                                const isManagerial = row.hierarchy === "Managerial" || row.hierarchy === "Supervisor";
                                const value = isManagerial ? manegerialValue : rnfValue;

                                // Determine period_start and period_end
                                let period_start, period_end;
                                if (dayOfMonth <= 5 || dayOfMonth >= 21) {
                                    // Second half of the month (16th to end of the month)
                                    period_start = moment().date(16).startOf('day').format('YYYY-MM-DD');
                                    period_end = moment().endOf('month').format('YYYY-MM-DD');
                                } else {
                                    // First half of the month (1st to 15th)
                                    period_start = moment().startOf('month').format('YYYY-MM-DD');
                                    period_end = moment().date(15).endOf('day').format('YYYY-MM-DD');
                                }

                                db.query(
                                    `SELECT * FROM payroll WHERE employee_id = ? AND DATE(created_at) = CURDATE()`,
                                    [employee_id],
                                    (err, payrollResult) => {
                                        if (err) {
                                            console.error("Database query error:", err);
                                        } else if (payrollResult.length === 0) {
                                            // No payroll entry for today, proceed with insertion
                                            db.query(
                                                `INSERT INTO payroll (payroll_id, employee_id, hours_worked, total_pay, period_start, period_end) 
                                             VALUES (?,?,?,?,?,?)`,
                                                [...value, period_start, period_end],
                                                (err) => {
                                                    if (err) {
                                                        console.error(err);
                                                    } else {
                                                        console.log(`Payroll processed for employee_id ${employee_id}`);
                                                    }
                                                }
                                            );

                                            console.log(number);
                                            const message = `Hello, ${row.name}. Your salary for the period from ${period_start} to ${period_end} has been processed. Please check your account. PHP${row.monthSalary} for working hours ${totalHours}.`;
                                            console.log(message);
                                            const run = async () => {
                                                const to = "63" + number;
                                                const from = "Vonage APIs";
                                                const text = message;

                                                await sendSMS(to, from, text);
                                                await sendEmail(row.email, row.name, message, 'employee_payslip');
                                                db.query(`INSERT INTO smsNotification (notification_id, employee_id, phone_number , message) VALUES (?,?,?,?)`, [notification_id, employee_id, number, message], (err) => {
                                                    if (err) {
                                                        console.error(err);
                                                    } else {
                                                        console.log(`SMS notification sent to employee_id ${employee_id}`);
                                                    }
                                                });
                                            };

                                            // async function sendSMS(to, from, text) {
                                            //     await vonage.sms.send({ to, from, text })
                                            //         .then(resp => {
                                            //             console.log('Message sent successfully');
                                            //             console.log(resp);
                                            //         })
                                            //         .catch(err => {
                                            //             console.log('There was an error sending the messages.');
                                            //             console.error(err);
                                            //         });
                                            // }
                                            // run();

                                            // Reset monthSalary to 0
                                            db.query(`UPDATE employees SET monthSalary = 0 WHERE employee_id = ?`, [employee_id], (err) => {
                                                if (err) {
                                                    console.error(err);
                                                } else {
                                                    console.log(`monthSalary reset to 0 for employee_id ${employee_id}`);
                                                }
                                            });
                                        } else {
                                            console.log(`Payroll already processed for employee_id ${employee_id} today.`);
                                        }
                                    }
                                );
                            }
                        }
                    );
                });
            }
        }
    );

}

// Schedule the cron job
cron.schedule(
    "0 17 5,20 * *",
    processPayroll,
    {
        scheduled: true,
        timezone: "Asia/Manila",
    }
);

module.exports = processPayroll;