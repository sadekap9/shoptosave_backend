import * as walletService from '../services/wallet.service.js';
import logger from '../utils/logger.js';

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

        const response = await walletService.addMoney(userId, { amount, payment_mode, payment_reference });
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

        const response = await walletService.withdraw(userId, { amount, reference_id });
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
        const response = await walletService.getWalletBalanceAndHistory(userId);
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
