import cron from 'node-cron';
import { syncCategoriesWithWoohoo, syncProductsWithWoohoo } from '../services/categories/categories.service.js';
import logger from './logger.js';

/**
 * Scheduled Tasks (Cron Jobs)
 */
export const initCronJobs = () => {
    // 1. Sync Categories with Woohoo every day at 3:00 AM
    // Schedule: '0 3 * * *'
    // For testing/development, you can use '0 0 * * *' (Every midnight) or '*/10 * * * *' (Every 10 mins)
    cron.schedule('0 3 * * *', async () => {
        logger.info('Starting Scheduled Category Sync');
        try {
            const result = await syncCategoriesWithWoohoo();
            logger.info('Scheduled Sync Completed Successfully', result);
        } catch (error) {
            logger.error('Scheduled Sync Failed', { error: error.message });
        }
    });

    // 2. Sync Products with Woohoo every 1st of the month at 4:00 AM
    // Schedule: '0 4 1 * *'
    cron.schedule('0 4 1 * *', async () => {
        logger.info('Starting Scheduled Monthly Product Sync');
        try {
            const result = await syncProductsWithWoohoo();
            logger.info('Scheduled Product Sync Completed', result);
        } catch (error) {
            logger.error('Scheduled Product Sync Failed', { error: error.message });
        }
    });

    logger.info('Cron Jobs initialized.');
};
