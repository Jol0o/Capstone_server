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
    let startDate, endDate;

    // Correct payroll period calculation
    if (dayOfMonth <= 15) {
        startDate = moment().startOf('month').format('YYYY-MM-DD');
        endDate = moment().date(15).format('YYYY-MM-DD');
    } else {
        startDate = moment().date(16).format('YYYY-MM-DD');
        endDate = moment().endOf('month').format('YYYY-MM-DD');
    }

    db.query(
        `SELECT * FROM employees`,
        (err, employees) => {
            if (err) {
                console.error("Database query error:", err);
                return;
            }

            employees.forEach((employee) => {
                const { employee_id, phone_number, name, monthSalary, basicSalary, hierarchy, email } = employee;
                const isManagerial = hierarchy === "Managerial" || hierarchy === "Supervisor";
                const salary = isManagerial ? basicSalary : monthSalary;

                let totalHours = 0;
                let absences = 0;

                const payroll_id = generateUUID();
                const notification_id = generateUUID();

                db.query(
                    `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
                    [employee_id, startDate, endDate],
                    (err, attendanceResult) => {
                        if (err) {
                            console.error("Attendance query error:", err);
                            return;
                        }

                        // Calculate total hours
                        totalHours = attendanceResult.reduce((total, attendance) => {
                            return total + Math.max(0, attendance.hours);
                        }, 0);

                        // Determine all workdays (excluding Sundays)
                        const periodDays = [];
                        for (let day = moment(startDate); day.isBefore(endDate) || day.isSame(endDate); day.add(1, 'days')) {
                            if (day.day() !== 0) { // Exclude Sundays
                                periodDays.push(day.format('YYYY-MM-DD'));
                            }
                        }

                        db.query(
                            `SELECT inclusive_dates, to_date FROM leaverequest WHERE employee_id = ? AND status IN ('approved', 'done')`,
                            [employee_id],
                            (err, leaveResult) => {
                                if (err) {
                                    console.error("Leave query error:", err);
                                    return;
                                }

                                // Collect leave dates
                                const leaveDates = new Set();
                                leaveResult.forEach(leave => {
                                    const leaveStart = moment(leave.inclusive_dates);
                                    const leaveEnd = moment(leave.to_date);
                                    for (let day = leaveStart; day.isBefore(leaveEnd) || day.isSame(leaveEnd); day.add(1, 'days')) {
                                        leaveDates.add(day.format('YYYY-MM-DD'));
                                    }
                                });

                                // Calculate absences (workdays not in attendance or leave)
                                absences = periodDays.filter(day =>
                                    !attendanceResult.some(attendance => attendance.date === day) &&
                                    !leaveDates.has(day)
                                ).length;

                                db.query(
                                    `SELECT * FROM payroll WHERE employee_id = ? AND DATE(created_at) = CURDATE()`,
                                    [employee_id],
                                    (err, payrollResult) => {
                                        if (err) {
                                            console.error("Payroll query error:", err);
                                            return;
                                        }

                                        if (payrollResult.length === 0) {
                                            db.query(
                                                `INSERT INTO payroll (payroll_id, employee_id, hours_worked, total_pay, period_start, period_end, absent) 
                                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                                [payroll_id, employee_id, totalHours, salary, startDate, endDate, absences],
                                                (err) => {
                                                    if (err) {
                                                        console.error("Payroll insertion error:", err);
                                                    } else {
                                                        console.log(`Payroll processed for employee_id ${employee_id}`);

                                                        const message = `Hello, ${name}. Your salary for the period from ${startDate} to ${endDate} has been processed. PHP${salary} for ${totalHours} hours worked. Absences: ${absences}.`;
                                                        sendNotifications(employee_id, phone_number, email, message, notification_id);

                                                        db.query(`UPDATE employees SET monthSalary = 0 WHERE employee_id = ?`, [employee_id]);
                                                    }
                                                }
                                            );
                                        } else {
                                            console.log(`Payroll already processed for employee_id ${employee_id} today.`);
                                        }
                                    }
                                );
                            }
                        );
                    }
                );
            });
        }
    );
}

function sendNotifications(employee_id, phone_number, email, message, notification_id) {
    const to = "63" + phone_number;
    const from = "Vonage APIs";

    sendSMS(to, from, message);
    sendEmail(email, employee_id, message, 'employee_payslip');

    db.query(
        `INSERT INTO smsNotification (notification_id, employee_id, phone_number, message) VALUES (?, ?, ?, ?)`,
        [notification_id, employee_id, phone_number, message],
        (err) => {
            if (err) console.error("SMS Notification insertion error:", err);
            else console.log(`SMS notification logged for employee_id ${employee_id}`);
        }
    );
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

async function sendSMS(to, from, text) {
    // await vonage.sms.send({ to, from, text })
    //     .then(resp => {
    //         console.log('Message sent successfully');
    //         console.log(resp);
    //     })
    //     .catch(err => {
    //         console.log('There was an error sending the messages.');
    //         console.error(err);
    //     });
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