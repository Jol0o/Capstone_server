const express = require('express');
const http = require('http');
const cors = require('cors');
const socketIo = require('socket.io');
const router = require('./routes/route');
const authMiddleware = require('./middleware/auth.js');
const authRouter = require('./routes/auth');
const cookieParser = require('cookie-parser');
const session = require('express-session');
require('./cron/scheduler.js');
require('./cron/scheduleOffEmployeeCheck.js');
require('./cron/updateSalary.js');
require('./cron/checkDay.js');

const app = express();
const server = http.createServer(app);

// app.use(
//     session({
//         secret: 'your_secret_key',
//         resave: false,
//         saveUninitialized: false,
//         cookie: { maxAge: 1000 * 60 * 60 * 24 },
//     }),
// );

const io = socketIo(server, {
    cors: {
        origin: ["https://capstone-system-two.vercel.app", "https://www.aap-h.com", 'http://localhost:3000', 'https://gasbee.aap-h.com'], // Add new origin
        methods: ["GET", "POST"],
        allowedHeaders: ["Authorization", "Content-Type"], // Add Content-Type to allowed headers
        credentials: true
    }
});

const corsOptions = {
    origin: ['https://capstone-system-two.vercel.app', 'https://www.aap-h.com', 'http://localhost:3000', 'https://gasbee.aap-h.com'], // Add new origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Allow cookies to be sent
};
app.use(cors(corsOptions));
app.use(cookieParser()); // Ensure cookie parser middleware is used
app.use(express.json());
// Middleware to attach io to req
app.use((req, res, next) => {
    req.io = io;
    next();
});


app.use('/api/auth', authRouter);
app.use('/api', authMiddleware, router);

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = 8080;

server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
