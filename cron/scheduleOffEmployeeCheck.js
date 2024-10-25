const cron = require("node-cron");
const db = require("../db");
const moment = require('moment-timezone');
require("dotenv").config();

if (!db) {
    console.error("Database connection not established");
    process.exit(1);
}


cron.schedule(
    "0 * * * *",
    () => {
        const currentDate = moment().tz('Asia/Manila').format('YYYY-MM-DD');
        console.log(`Checking for leave requests on ${currentDate}`);

        const q = 'SELECT * FROM leaveRequest WHERE inclusive_dates = ?'
        db.query(q, [currentDate], (err, result) => {
            if (err) {
                console.error("Database query error:", err);
            } else {
                if (result.length > 0) {
                    result.forEach((row) => {
                        const q = 'UPDATE employees SET day_off = ? WHERE employee_id = ?'
                        db.query(q, [true, row.employee_id], (err, result) => {
                            if (err) {
                                console.error("Database query error:", err);
                            } else {
                                console.log(`Employee ${row.employee_id} has been checked off`);
                            }
                        })
                    })
                }
            }
        })

        console.log('Starting scheduled task to check on employees end off');
        const q2 = 'SELECT * FROM leaveRequest WHERE to_date = ?'
        db.query(q2, [currentDate], (err, result) => {
            if (err) {
                console.error("Database query error:", err);
            } else {
                if (result.length > 0) {
                    result.forEach((row) => {
                        const q = 'UPDATE employees SET day_off = ? WHERE employee_id = ?'
                        db.query(q, [false, row.employee_id], (err, result) => {
                            if (err) {
                                console.error("Database query error:", err);
                            } else {
                                console.log(`Employee ${row.employee_id} has been checked on`);
                            }
                        })
                    })
                }
            }
        })
    },
    {
        scheduled: true,
        timezone: "Asia/Manila",
    }
);