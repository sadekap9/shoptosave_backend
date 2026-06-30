import cron from 'node-cron';
import { syncCategoriesWithWoohoo, syncProductsWithWoohoo } from '../services/categories/categories.service.js';
import { refreshWoohooToken } from '../services/categories/woohooAuth.service.js';
import { resolvePendingOrdersService } from '../services/orders/orders.service.js';
import logger from '../utils/logger.js';

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

    // 3. Force-refresh Woohoo Bearer Token every 6 days (before the 7-day expiration)
    // Schedule: '0 0 */6 * *'
    cron.schedule('0 0 */6 * *', async () => {
        logger.info('Starting Scheduled Woohoo Token Refresh');
        try {
            await refreshWoohooToken();
            logger.info('Scheduled Woohoo Token Refresh Completed Successfully');
        } catch (error) {
            logger.error('Scheduled Woohoo Token Refresh Failed', { error: error.message });
        }
    });

    // 4. Resolve pending orders stuck due to timeouts
    // Schedule: '*/5 * * * *' (Every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        logger.info('Starting Scheduled Pending Order Resolution');
        try {
            await resolvePendingOrdersService();
            logger.info('Scheduled Pending Order Resolution Completed Successfully');
        } catch (error) {
            logger.error('Scheduled Pending Order Resolution Failed', { error: error.message });
        }
    });

    logger.info('Cron Jobs initialized.');
};
