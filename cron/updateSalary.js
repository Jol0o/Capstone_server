const cron = require('node-cron');
const db = require('../db');
const moment = require('moment-timezone');
require('dotenv').config();

if (!db) {
    console.error('Database connection not established');
    process.exit(1);
}

const resetEmployeeSalaries = () => {
    const query = `
        UPDATE employees
        SET totalSalary = monthSalary
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error('Error resetting employee salaries:', err);
        } else {
            console.log('Employee salaries reset successfully:', result);
        }
    });
};

// Schedule the task to run on the 15th and 30th of each month at midnight
cron.schedule('0 0 15,30 * *', () => {
    console.log('Running salary reset task...');
    resetEmployeeSalaries();
}, {
    scheduled: true,
    timezone: 'Asia/Manila'
});