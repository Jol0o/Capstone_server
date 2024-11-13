const axios = require("axios");

require("dotenv").config();

const CALENDARIFIC_API_URL = 'https://calendarific.com/api/v2/holidays';

const getHolidays = async (year, country) => {
    try {
        const response = await axios.get(CALENDARIFIC_API_URL, {
            params: {
                api_key: process.env.CALENDARIFIC_API_KEY,
                country: country,
                year: year,
            },
        });
        return response.data.response.holidays;
    } catch (error) {
        console.error('Error fetching holidays:', error);
        throw error;
    }
};

module.exports = getHolidays;