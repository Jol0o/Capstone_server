const express = require('express');
const app = express();
const cors = require('cors');
const router = require('./routes/route');
const authMiddleware = require('./middleware/auth.js');
const authRouter = require('./routes/auth');

require('./scheduler.js');

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api', authMiddleware, router);


const PORT = 8080;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));