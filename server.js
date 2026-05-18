import dotenv from 'dotenv';
dotenv.config();
import app from './app.js';
import { initCronJobs } from './utils/cron.js';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 5000;

const startServer = () => {
    try {
        app.listen(PORT, () => {
            logger.info(`Server is running! Port: ${PORT}`);
            initCronJobs(); // Start scheduled tasks
        });
    } catch (error) {
        logger.error('Error starting server', { error: error.message, stack: error.stack });
        process.exit(1);
    }
};

startServer();
