const cron = require("node-cron");
const db = require("./db");
const { SinchClient } = require("@sinch/sdk-core");
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

cron.schedule(
    "0 15 * * *",
    () => {
        console.log("Cron job started"); // Log when the cron job starts
        const currentDate = new Date();
        const currentDay = currentDate.getDate(); // Get current day

        db.query(
            "SELECT *, DAY(salary_date) as salary_date FROM employees WHERE DAY(salary_date) = ?",
            [currentDay],
            (err, result) => {
                if (err) {
                    console.error("Database query error:", err); // Log any database query errors
                } else {
                    result.forEach((row) => {
                        // Do something with row
                        console.log('running cron job')
                        const number = row.phone_number.substring(1);
                        let totalHours;
                        const employee_id = row.employee_id; // replace with the actual employee id
                        const month = new Date().getMonth() + 1; // get the current month
                        const year = new Date().getFullYear(); // get the current year
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
                            (err, result) => {
                                if (err) {
                                    console.error("Database query error:", err); // Log any database query errors
                                } else {
                                    totalHours = result.reduce((total, attendance) => {
                                        return total + attendance.hours;
                                    }, 0);

                                    db.query(`INSERT INTO payroll (payroll_id, employee_id, hours_worked , total_pay) VALUES (?,?, ?,?)`, [payroll_id, employee_id, totalHours, row.salary], (err, result) => {
                                        if (err) {
                                            console.error(err);
                                        } else {
                                            console.log(result);
                                        }
                                    });

                                    console.log(number);
                                    const message = `Hello, ${row.name}. Your salary for this month has been processed. Please check your account. PHP${row.salary} working hours ${totalHours}.`;
                                    console.log(message);
                                    // const run = async () => {
                                    //     const response = await sinchClient.sms.batches.send({
                                    //         sendSMSRequestBody: {
                                    //             to: [
                                    //                 "63" + number
                                    //             ],
                                    //             from: process.env.SINCHNUMBER,
                                    //             body: "This is a test message using the Sinch Node.js SDK."
                                    //         }
                                    //     });
                                    //     console.log(JSON.stringify(response));
                                    // db.query(`INSERT INTO sms_notifications (employee_id, phone_number , message) VALUES (?,?, ?)`, [employee_id, number, message], (err, result) => {
                                    //     if (err) {
                                    //         console.error(err);
                                    //     } else {
                                    //         console.log(result);
                                    //     }
                                    // });
                                    // }
                                    // run(); // Call the function
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
