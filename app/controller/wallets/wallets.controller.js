import * as walletsService from '../../services/wallets/wallets.service.js';
import logger from '../../utils/logger.js';

/**
 * Request Wallet Topup
 */
export const requestTopup = async (req, res) => {
    try {
        const userId = req.user.id;
        const topupData = req.validatedData;

        logger.info(`[Wallets Controller] User ${userId} is requesting a top-up of ${topupData.amount}`);
        const response = await walletsService.requestTopupService(userId, topupData);

        return res.status(response.statusCode).json({
            success: response.success,
            errors: [],
            result: {
                message: response.message
            }
        });
    } catch (error) {
        logger.error('[Wallets Controller] Error in requestTopup', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Approve Wallet Topup (Admin/Sub-Admin only)
 */
export const approveTopup = async (req, res) => {
    try {
        const adminId = req.user.id;
        const { requestId } = req.params;
        const { status, remarks } = req.validatedData;

        logger.info(`[Wallets Controller] Admin ${adminId} is approving/rejecting request ID ${requestId} with status ${status}`);
        const response = await walletsService.approveTopupService(adminId, requestId, status, remarks);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message
            }
        });
    } catch (error) {
        logger.error('[Wallets Controller] Error in approveTopup', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Fetch User Wallet History
 */
export const getWalletHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const response = await walletsService.getWalletHistoryService(userId);

        return res.status(response.statusCode).json({
            success: response.success,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('[Wallets Controller] Error in getWalletHistory', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Fetch Current Wallet Details (Balance, Cashback)
 */
export const getWalletDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        const response = await walletsService.getWalletDetailsService(userId);

        return res.status(response.statusCode).json({
            success: response.success,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('[Wallets Controller] Error in getWalletDetails', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
