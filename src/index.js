const express = require('express');

const { ServerConfig, Queue } = require('./config');
const redisClient = require('./config/redis');
const apiRoutes = require('./routes');
const CRON = require('./utils/common/cron-jobs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRoutes);
app.use('/bookingService/api', apiRoutes);

app.listen(ServerConfig.PORT, async () => {
    try {
        console.log(`Successfully started the server on PORT: ${ServerConfig.PORT}`);

        await redisClient.connect();
        console.log("Redis connected");

        await Queue.connectQueue();
        console.log("Queue connected");

        CRON();
    } catch (err) {
        console.error("Server startup failed:", err);
    }
});