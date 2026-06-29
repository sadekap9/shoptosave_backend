import * as walletsService from '../../services/wallets/wallets.service.js';
import logger from '../../utils/logger.js';

/**
 * POST /api/v1/wallets/topup
 * User requests instant auto-approved wallet top-up (legacy)
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
 * GET /api/v1/wallets/history
 * Fetch authenticated user's wallet transactions ledger (all records)
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
 * GET /api/v1/wallets/details
 * Fetch current available balance & cashback details
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
 * POST /api/v1/wallets/add-money
 * Add money to wallet (creates payment_transaction + wallet_transaction + updates user_wallet)
 */
export const addMoney = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, payment_method, gateway_transaction_id } = req.body;

        if (!amount || !payment_method) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: amount, payment_method',
                code: 'INVALID_PARAMETERS'
            });
        }

        const response = await walletsService.addMoney(userId, { amount, payment_method, gateway_transaction_id });
        return res.status(200).json({
            success: true,
            result: response
        });

    } catch (error) {
        logger.error('[Wallet Controller] addMoney failed', { error: error.message || error });
        return res.status(error.statusCode || 400).json({
            success: false,
            error: error.message || 'Failed to add money',
            code: error.code || 'TOPUP_FAILED'
        });
    }
};

/**
 * POST /api/v1/wallets/withdraw
 * Withdraw from wallet
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
 * GET /api/v1/wallets/balance
 * Get balance, cashback earned, cashback used, and recent transactions
 */
export const getBalance = async (req, res) => {
    try {
        const userId = req.user.id;
        const response = await walletsService.getWalletBalanceAndHistory(userId);
        return res.status(200).json({
            success: true,
            data: response.data
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

/**
 * GET /api/v1/wallets/transactions
 * Get paginated wallet transaction history for authenticated user.
 * Query params: ?page=1&limit=10
 */
export const getTransactionHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page, limit } = req.query;

        const response = await walletsService.getWalletTransactionHistory(userId, page, limit);
        return res.status(200).json({
            success: true,
            data: response.data
        });

    } catch (error) {
        logger.error('[Wallet Controller] getTransactionHistory failed', { error: error.message || error });
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve transaction history',
            code: 'FETCH_FAILED'
        });
    }
};
