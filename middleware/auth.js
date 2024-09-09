const { verifyToken } = require("../utils/auth");
const asyncHandler = require('express-async-handler');

const authMiddleware = asyncHandler(async (req, res, next) => {
    // Check for the token in the cookies
    const token = req.cookies.token;
    // console.log(req.cookies)

    if (!token) {
        console.log('Token is missing in cookies!');
        return res.status(401).json({ message: 'Token is missing!' });
    }

    // console.log('Token from cookie:', token);

    try {
        // Verify the token
        const decoded = verifyToken(token);
        // console.log('Decoded token:', decoded);
        req.user = decoded; // Attach decoded user info to the request object
        next(); // Continue to the next middleware or route handler
    } catch (error) {
        console.log('Invalid token:', error.message);
        return res.status(401).json({ message: 'Invalid token' });
    }
});

module.exports = authMiddleware;
