const cron = require('node-cron');
const moment = require('moment-timezone');
const db = require('../db');

cron.schedule('*/5 * * * *', () => {
    const date = moment().tz('Asia/Manila');
    const isSunday = date.day() === 0; // 0 represents Sunday

    if (isSunday) {
        db.query("UPDATE employees SET status = 'off duty'", (err, result) => {
            if (err) {
                console.error("Error updating employee status:", err);
                throw err;
            } else {
                console.log("Employee status updated to 'off duty' for Sunday");
            }
        });
    }
}, {
    scheduled: true,
    timezone: 'Asia/Manila'
});
