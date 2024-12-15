const cron = require("node-cron");
const db = require("../db");
const moment = require('moment-timezone');
require("dotenv").config();

if (!db) {
    console.error('Database connection not established');
    process.exit(1);
}

const resetEmployeeSalaries = () => {
        const query = `
        UPDATE employees
        SET 
            monthSalary = CASE
                WHEN hierarchy = 'Rank & File' THEN totalSalary
                ELSE basicSalary
            END,
            totalSalary = CASE
                WHEN hierarchy = 'Rank & File' THEN 0
                ELSE totalSalary
            END
    `;

    return new Promise((resolve, reject) => {
        db.query(query, (err, result) => {
            if (err) {
                console.error('Error resetting employee salaries:', err);
                reject('Error resetting employee salaries');
            } else {
                console.log('Employee salaries reset successfully:', result);
                resolve('Employee salaries reset successfully');
            }
        });
    });
};

// Schedule the task to run on the 15th and 30th of each month at midnight
cron.schedule("0 0 15,30 * *", () => {
    console.log('Running salary reset task...');
    resetEmployeeSalaries()
        .then(message => console.log(message))
        .catch(error => console.error(error));
}, {
    scheduled: true,
    timezone: 'Asia/Manila'
});

module.exports = resetEmployeeSalaries;