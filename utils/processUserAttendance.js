const moment = require('moment-timezone');
const db = require('../db'); // Adjust the path as needed

const processUserAttendance = (id, startDate, endDate, page = 1, limit = 5) => {
    return new Promise((resolve, reject) => {
        const offset = (page - 1) * limit;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM attendance
            WHERE attendance.employee_id = ?
            ${startDate && endDate ? 'AND attendance.date BETWEEN ? AND ?' : ''}
        `;

        const attendanceQuery = `
            SELECT 
                attendance.employee_id, 
                attendance.date, 
                attendance.time_in,
                attendance.time_out,
                DAYNAME(attendance.date) as day
            FROM 
                attendance
            WHERE 
                attendance.employee_id = ?
                ${startDate && endDate ? 'AND attendance.date BETWEEN ? AND ?' : ''}
            ORDER BY 
                attendance.date
            LIMIT ? OFFSET ?
        `;

        const countParams = [id];
        const attendanceParams = [id];

        if (startDate && endDate) {
            countParams.push(startDate, endDate);
            attendanceParams.push(startDate, endDate);
        }

        db.query(countQuery, countParams, (err, countResult) => {
            if (err) {
                return reject(err);
            }

            const total = countResult[0].total;
            const totalPages = Math.ceil(total / limit);

            attendanceParams.push(parseInt(limit), parseInt(offset));

            db.query(attendanceQuery, attendanceParams, (err, attendanceResult) => {
                if (err) {
                    return reject(err);
                }

                const leaveRequestQuery = `
                    SELECT 
                        inclusive_dates, 
                        to_date, 
                        status 
                    FROM 
                        leaveRequest 
                    WHERE 
                        employee_id = ? 
                        AND status IN ('Done', 'Approved')
                `;

                db.query(leaveRequestQuery, [id], (err, leaveRequestResult) => {
                    if (err) {
                        return reject(err);
                    }

                    const attendanceData = [];
                    let previousDate = null;
                    const today = moment().tz('Asia/Manila').startOf('day');

                    // Map leave dates with their inclusive date ranges for easier checking
                    const leaveDates = leaveRequestResult.flatMap(leave => {
                        let datesInRange = [];
                        let start = moment(leave.inclusive_dates).tz('Asia/Manila');
                        const end = moment(leave.to_date).tz('Asia/Manila');
                        while (start.isSameOrBefore(end, 'day')) {
                            datesInRange.push({
                                date: start.clone().format('YYYY-MM-DD'),
                                inclusive_dates: leave.inclusive_dates,
                                to_date: leave.to_date,
                                status: 'off duty'
                            });
                            start.add(1, 'day');
                        }
                        return datesInRange;
                    });

                    // Function to get leave data for a specific date
                    const getLeaveDataForDate = (date) => {
                        return leaveDates.find(leave => leave.date === date);
                    };

                    attendanceResult.forEach(record => {
                        const currentDate = moment(record.date).tz('Asia/Manila');
                        const timeIn = moment.tz(`${record.date} ${record.time_in}`, 'YYYY-MM-DD hh:mm A', 'Asia/Manila');
                        const eightAM = moment.tz(`${record.date} 08:00 AM`, 'YYYY-MM-DD hh:mm A', 'Asia/Manila');

                        // Initialize status as "absent"
                        let status = 'absent';

                        // Check if the current date falls within any leave request period
                        const leaveData = getLeaveDataForDate(currentDate.format('YYYY-MM-DD'));

                        if (leaveData) {
                            status = 'off duty';
                        } else if (record.time_in) {
                            // If the employee has a time-in record, adjust status accordingly
                            status = timeIn.isSameOrBefore(eightAM) ? 'present' : 'late';
                        }

                        // Set status to "off duty" if the day is Sunday
                        if (record.day === 'Sunday') {
                            status = 'off duty';
                        }

                        // Check for gaps in dates and add "absent" status for missing dates
                        if (previousDate) {
                            const diffDays = currentDate.diff(previousDate, 'days');
                            for (let i = 1; i < diffDays; i++) {
                                const missingDate = previousDate.clone().add(i, 'days');
                                const missingLeaveData = getLeaveDataForDate(missingDate.format('YYYY-MM-DD'));
                                attendanceData.push({
                                    employee_id: record.employee_id,
                                    date: missingDate.format('YYYY-MM-DD'),
                                    day: missingDate.format('dddd'),
                                    status: missingLeaveData ? 'off duty' : 'absent',
                                    inclusive_dates: missingLeaveData ? missingLeaveData.inclusive_dates : null,
                                    to_date: missingLeaveData ? missingLeaveData.to_date : null,
                                    leave_status: missingLeaveData ? missingLeaveData.status : null
                                });
                            }
                        }

                        // Add the current record with determined status
                        attendanceData.push({
                            employee_id: record.employee_id,
                            date: record.date,
                            day: record.day,
                            status: status,
                            time_in: record.time_in,
                            time_out: record.time_out,
                            inclusive_dates: leaveData ? leaveData.inclusive_dates : null,
                            to_date: leaveData ? leaveData.to_date : null,
                            leave_status: leaveData ? leaveData.status : null
                        });

                        previousDate = currentDate;
                    });

                    // Add "absent" entries for dates after the last attendance record up to today
                    if (previousDate) {
                        let nextDate = previousDate.clone().add(1, 'days');
                        while (nextDate.isBefore(today) || nextDate.isSame(today, 'day')) {
                            const nextLeaveData = getLeaveDataForDate(nextDate.format('YYYY-MM-DD'));
                            attendanceData.push({
                                employee_id: id,
                                date: nextDate.format('YYYY-MM-DD'),
                                day: nextDate.format('dddd'),
                                status: nextLeaveData ? 'off duty' : 'absent',
                                inclusive_dates: nextLeaveData ? nextLeaveData.inclusive_dates : null,
                                to_date: nextLeaveData ? nextLeaveData.to_date : null,
                                leave_status: nextLeaveData ? nextLeaveData.status : null
                            });
                            nextDate.add(1, 'days');
                        }
                    }

                    resolve({
                        status: 'ok',
                        data: attendanceData,
                        currentPage: parseInt(page),
                        totalPages: totalPages,
                        isLastPage: parseInt(page) === totalPages
                    });
                });
            });
        });
    });
};

module.exports = processUserAttendance;