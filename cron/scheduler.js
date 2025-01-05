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

    let startDate, endDate;

    // Determine last processed payroll period
    db.query(
        "SELECT MAX(period_end) AS last_end_date FROM payroll",
        (err, result) => {
            if (err) {
                console.error("Database query error:", err);
                return;
            }

            const lastEndDate = result[0]?.last_end_date
                ? moment(result[0].last_end_date)
                : null;

            if (lastEndDate) {
                // If the last payroll ended on the 15th, the next period is 16th to end of the same month
                if (lastEndDate.date() === 15) {
                    startDate = lastEndDate.clone().add(1, 'day').format('YYYY-MM-DD');
                    endDate = lastEndDate.clone().endOf('month').format('YYYY-MM-DD');
                }
                // If the last payroll ended on the last day of a month, the next period is 1st to 15th of the next month
                else if (lastEndDate.isSame(lastEndDate.clone().endOf('month'), 'day')) {
                    startDate = lastEndDate.clone().add(1, 'day').startOf('month').format('YYYY-MM-DD');
                    endDate = lastEndDate.clone().add(1, 'month').date(15).format('YYYY-MM-DD');
                } else {
                    console.error("Unexpected payroll end date:", lastEndDate.format('YYYY-MM-DD'));
                    return;
                }
            } else {
                // No payroll found; start with the first period of the current month
                if (currentDate.date() <= 15) {
                    startDate = currentDate.clone().startOf('month').format('YYYY-MM-DD');
                    endDate = currentDate.clone().date(15).format('YYYY-MM-DD');
                } else {
                    startDate = currentDate.clone().date(16).format('YYYY-MM-DD');
                    endDate = currentDate.clone().endOf('month').format('YYYY-MM-DD');
                }
            }

            console.log(`Processing payroll for period: ${startDate} to ${endDate}`);
            processPayrollForPeriod(startDate, endDate);
        }
    );
}


function processPayrollForPeriod(startDate, endDate) {
    db.query(
        `SELECT * FROM employees`,
        (err, employees) => {
            if (err) {
                console.error("Database query error:", err);
                return;
            }

            employees.forEach((employee) => {
                                const { employee_id, phone_number, name, basicSalary, hierarchy, email, totalSalary: grossPay } = employee;
                const isManagerial = hierarchy === "Managerial" || hierarchy === "Supervisor";

                let totalHours = 0;
                let absences = 0;
                let totalSalary = 0;
                let totalOvertimePay = 0;

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

                        // Calculate total hours and salary for the period
                        attendanceResult.forEach((attendance) => {
                            const hoursWorked = Math.max(0, attendance.hours); // Ensure no negative hours
                            totalHours += hoursWorked;

                            if (!isManagerial && basicSalary) {
                                const hourlyRate = basicSalary / 8;
                                const regularHours = Math.min(hoursWorked, 8);
                                const overtimeHours = Math.max(0, hoursWorked - 8);

                                const dailySalary = hourlyRate * regularHours;
                                const overtimePay = hourlyRate * 1.3 * overtimeHours;

                                totalSalary += dailySalary;
                                totalOvertimePay += overtimePay;
                            }
                        });

                        // Determine all workdays (excluding Sundays)
                        const periodDays = [];
                        for (let day = moment(startDate); day.isBefore(endDate) || day.isSame(endDate); day.add(1, 'days')) {
                            if (day.day() !== 0) { // Exclude Sundays
                                periodDays.push(day.format('YYYY-MM-DD'));
                            }
                        }

                        db.query(
                            `SELECT inclusive_dates, to_date FROM leaveRequest WHERE employee_id = ? AND status IN ('approved', 'done')`,
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

                                        // if (payrollResult.length === 0) {
                                            const finalSalary = isManagerial ? grossPay : totalSalary + totalOvertimePay;
                                            db.query(
                                                `INSERT INTO payroll (payroll_id, employee_id, hours_worked, total_pay, period_start, period_end, absent) 
                                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                                [payroll_id, employee_id, totalHours, finalSalary, startDate, endDate, absences],
                                                (err) => {
                                                    if (err) {
                                                        console.error("Payroll insertion error:", err);
                                                    } else {
                                                        console.log(`Payroll processed for employee_id ${employee_id}`);

                                                        const message = `Hello, ${name}. Your salary for the period from ${startDate} to ${endDate} has been processed. PHP${finalSalary.toFixed(2)} for ${totalHours} hours worked, including PHP${totalOvertimePay.toFixed(2)} for overtime. Absences: ${absences}.`;
                                                        sendNotifications(employee_id, phone_number, email, message, notification_id);

                                                        if (!isManagerial) {
                                                            db.query(`UPDATE employees SET monthSalary = 0 WHERE employee_id = ?`, [employee_id]);
                                                        }
                                                    }
                                                }
                                            );
                                        // } else {
                                        //     console.log(`Payroll already processed for employee_id ${employee_id} today.`);
                                        // }
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