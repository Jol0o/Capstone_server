const cron = require("node-cron");
const db = require("../db");
const { SinchClient } = require("@sinch/sdk-core");
const moment = require('moment-timezone');
require("dotenv").config();

if (!db) {
    console.error("Database connection not established");
    process.exit(1);
}


const sinchClient = new SinchClient({
    projectId: process.env.PROJECTID,
    keyId: process.env.ACCESSKEY,
    keySecret: process.env.ACCESSSECRET,
});

function processPayroll() {
    console.log("Payroll processing started");
    const currentDate = moment().tz('Asia/Manila');
    const currentDay = currentDate.date();

    db.query(
        "SELECT * FROM employees",
        (err, result) => {
            if (err) {
                console.error("Database query error:", err);
            } else {
                result.forEach((row) => {
                    console.log('running payroll processing');
                    const number = row.phone_number.substring(1);
                    let totalHours = 0;
                    const employee_id = row.employee_id;
                    const month = currentDate.month() + 1;
                    const year = currentDate.year();
                    function generateUUID() {
                        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                            const r = (Math.random() * 16) | 0,
                                v = c === 'x' ? r : (r & 0x3) | 0x8;
                            return v.toString(16);
                        });
                    }
                    const payroll_id = generateUUID();

                    db.query(
                        `SELECT * FROM attendance WHERE employee_id = ? AND MONTH(date) = ? AND YEAR(date) = ?`,
                        [employee_id, month, year],
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
                                const manegerialValue = [payroll_id, employee_id, totalHours, row.baseSalary];
                                const isManagerial = row.hierarchy === "Managerial" || row.hierarchy === "Supervisor";
                                const value = isManagerial ? manegerialValue : rnfValue;

                                // Check if payroll already exists for today
                                db.query(
                                    `SELECT * FROM payroll WHERE employee_id = ? AND DATE(created_at) = CURDATE()`,
                                    [employee_id],
                                    (err, payrollResult) => {
                                        if (err) {
                                            console.error("Database query error:", err);
                                        } else if (payrollResult.length === 0) {
                                            // No payroll entry for today, proceed with insertion
                                            db.query(`INSERT INTO payroll (payroll_id, employee_id, hours_worked, total_pay) VALUES (?,?,?,?)`, value, (err, result) => {
                                                if (err) {
                                                    console.error(err);
                                                } else {
                                                    console.log(result);
                                                }
                                            });

                                            console.log(number);
                                            const message = `Hello, ${row.name}. Your salary for this month has been processed. Please check your account. PHP${row.monthSalary} working hours ${totalHours}.`;
                                            console.log(message);
                                            const run = async () => {
                                                const response = await sinchClient.sms.batches.send({
                                                    sendSMSRequestBody: {
                                                        to: [
                                                            "+63" + number
                                                        ],
                                                        from: process.env.SINCHNUMBER,
                                                        body: message,
                                                    }
                                                });
                                                console.log(JSON.stringify(response));
                                                db.query(`INSERT INTO smsnotification (employee_id, phone_number , message) VALUES (?,?, ?)`, [employee_id, number, message], (err, result) => {
                                                    if (err) {
                                                        console.error(err);
                                                    } else {
                                                        console.log(result);
                                                    }
                                                });
                                            }
                                            run();

                                            // Reset monthSalary to 0
                                            db.query(`UPDATE employees SET monthSalary = 0 WHERE employee_id = ?`, [employee_id], (err, result) => {
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