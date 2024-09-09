const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'your_secret_key';

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

const generateToken = (results) => {
    return jwt.sign({ id: results.id, employee_id: results.employee_id, name: results.name, email: results.email, number: results.phone_number }, SECRET_KEY, { expiresIn: '1w' });
};

const verifyToken = (token) => {
    return jwt.verify(token, SECRET_KEY);
};

module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken
};
