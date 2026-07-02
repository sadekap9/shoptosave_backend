import dotenv from 'dotenv';
dotenv.config();

// Suppress noisy node-cron missed execution warnings caused by local dev reloading/system lag
const originalWarn = console.warn;
console.warn = function (...args) {
    if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('[NODE-CRON]')) {
        return;
    }
    originalWarn.apply(console, args);
};

import app from './app.js';
import { initCronJobs } from './app/cron/cron.js';
import logger from './app/utils/logger.js';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
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
