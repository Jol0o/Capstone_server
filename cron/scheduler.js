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

//  "* 16 5,20 * *",
cron.schedule(
    '*/5 * * * *',
    () => {
        console.log("Cron job started"); // Log when the cron job starts
        const currentDate = moment().tz('Asia/Manila');
        const currentDay = currentDate.date(); // Get current day

        db.query(
            "SELECT * FROM employees",
            (err, result) => {
                if (err) {
                    console.error("Database query error:", err); // Log any database query errors
                } else {
                    result.forEach((row) => {
                        // Do something with row
                        console.log('running cron job')
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
                                    console.error("Database query error:", err); // Log any database query errors
                                } else {
                                    totalHours = attendanceResult.reduce((total, attendance) => {
                                        console.log(`Attendance record: ${JSON.stringify(attendance)}`); // Log each attendance record
                                        if (attendance.hours < 0) {
                                            console.warn(`Negative hours detected for employee_id ${employee_id} on date ${attendance.date}: ${attendance.hours}`);
                                        }
                                        return total + Math.max(0, attendance.hours); // Ensure hours are non-negative
                                    }, 0);

                                    const rnfValue = [payroll_id, employee_id, totalHours, row.totalSalary];
                                    const manegerialValue = [payroll_id, employee_id, totalHours, row.baseSalary];

                                    // Assuming there is a condition to determine which value to use
                                    const isManagerial = row.hierarchy === "Manegerial" || row.hierarchy === "Supervisor"; // Example condition

                                    const value = isManagerial ? manegerialValue : rnfValue;

                                    db.query(`INSERT INTO payroll (payroll_id, employee_id, hours_worked, total_pay) VALUES (?,?,?,?)`, value, (err, result) => {
                                        if (err) {
                                            console.error(err);
                                        } else {
                                            console.log(result);
                                        }
                                    });

                                    console.log(number);
                                    const message = `Hello, ${row.name}. Your salary for this month has been processed. Please check your account. PHP${row.totalSalary} working hours ${totalHours}.`;
                                    console.log(message);
                                    const run = async () => {
                                        const response = await sinchClient.sms.batches.send({
                                            sendSMSRequestBody: {
                                                to: [
                                                    "63" + number
                                                ],
                                                from: process.env.SINCHNUMBER,
                                                body: "This is a test message using the Sinch Node.js SDK."
                                            }
                                        });
                                        console.log(JSON.stringify(response));
                                        db.query(`INSERT INTO sms_notifications (employee_id, phone_number , message) VALUES (?,?, ?)`, [employee_id, number, message], (err, result) => {
                                            if (err) {
                                                console.error(err);
                                            } else {
                                                console.log(result);
                                            }
                                        });
                                    }
                                    run(); // Call the function
                                }
                            }
                        );
                    });
                }
            }
        );
    },
    {
        scheduled: true,
        timezone: "Asia/Manila",
    }
);