import dotenv from 'dotenv';
dotenv.config();
import app from './app.js';
import { initCronJobs } from './app/cron/cron.js';
import { runMigrations } from './app/config/migration.js';
import logger from './app/utils/logger.js';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await runMigrations(); // Run schema migrations
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
