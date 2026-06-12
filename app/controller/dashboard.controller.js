import * as dashboardService from '../services/dashboard/dashboard.service.js';
import logger from '../utils/logger.js';

/**
 * GET /api/v1/dashboard
 * Public endpoint — no authentication required
 */
export const getDashboard = async (req, res) => {
    try {
        const response = await dashboardService.getDashboardService();

        return res.status(response.statusCode).json({
            success: response.success,
            message: response.message,
            data: response.data
        });
    } catch (error) {
        logger.error('Error in getDashboard', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            data: {}
        });
    }
};

