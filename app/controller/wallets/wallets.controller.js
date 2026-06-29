import * as walletsService from '../../services/wallets/wallets.service.js';
import logger from '../../utils/logger.js';

/**
 * Request Wallet Topup (Instant Auto-Approved)
 */
export const requestTopup = async (req, res) => {
    try {
        const userId = req.user.id;
        const topupData = req.validatedData;

        logger.info(`[Wallets Controller] User ${userId} is requesting a top-up of ${topupData.amount}`);
        const response = await walletsService.requestTopupService(userId, topupData);

        return res.status(200).json({
            success: true,
            result: response
        });
    } catch (error) {
        logger.error('[Wallets Controller] Error in requestTopup', { error: error.message, stack: error.stack });
        return res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Internal server error',
            code: error.code || 'TOPUP_FAILED'
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

/**
 * Request Wallet Top-up Endpoint (Pending request creation)
 */
export const addMoney = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, payment_mode, payment_reference } = req.body;

        if (!amount || !payment_mode || !payment_reference) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: amount, payment_mode, payment_reference',
                code: 'INVALID_PARAMETERS'
            });
        }

        const response = await walletsService.addMoney(userId, { amount, payment_mode, payment_reference });
        return res.status(200).json({
            success: true,
            result: response
        });

    } catch (error) {
        logger.error('[Wallet Controller] addMoney failed', { error: error.message || error });
        return res.status(error.statusCode || 400).json({
            success: false,
            error: error.message || 'Failed to request top-up',
            code: error.code || 'TOPUP_FAILED'
        });
    }
};

/**
 * Wallet Withdrawal Endpoint
 */
export const withdraw = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, reference_id } = req.body;

        if (!amount || !reference_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: amount, reference_id',
                code: 'INVALID_PARAMETERS'
            });
        }

        const response = await walletsService.withdraw(userId, { amount, reference_id });
        return res.status(200).json({
            success: true,
            result: response
        });

    } catch (error) {
        logger.error('[Wallet Controller] withdraw failed', { error: error.message || error });
        return res.status(error.statusCode || 400).json({
            success: false,
            error: error.message || 'Failed to initiate withdrawal',
            code: error.code || 'WITHDRAW_FAILED'
        });
    }
};

/**
 * Get Balance & Transaction History Ledger Endpoint
 */
export const getBalance = async (req, res) => {
    try {
        const userId = req.user.id;
        const response = await walletsService.getWalletBalanceAndHistory(userId);
        return res.status(200).json({
            success: true,
            result: response.data
        });

    } catch (error) {
        logger.error('[Wallet Controller] getBalance failed', { error: error.message || error });
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve wallet information',
            code: 'FETCH_FAILED'
        });
    }
};
