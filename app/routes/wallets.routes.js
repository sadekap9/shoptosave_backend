import express from 'express';
import * as walletsController from '../controller/wallets/wallets.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { requestTopupSchema } from '../validations/wallet.validation.js';

const router = express.Router();

/**
 * POST /api/v1/wallets/topup
 * User requests instant auto-approved wallet top-up (legacy)
 */
router.post(
    '/topup',
    authMiddleware,
    validate(requestTopupSchema),
    walletsController.requestTopup
);

/**
 * POST /api/v1/wallets/add-money
 * Add money to wallet (payment_transaction + wallet_transaction + user_wallet update)
 */
router.post('/add-money', authMiddleware, walletsController.addMoney);

/**
 * POST /api/v1/wallets/withdraw
 * Withdraw from wallet
 */
router.post('/withdraw', authMiddleware, walletsController.withdraw);

/**
 * GET /api/v1/wallets/balance
 * Get balance, cashback earned/used, and recent transactions
 */
router.get('/balance', authMiddleware, walletsController.getBalance);

/**
 * GET /api/v1/wallets/details
 * Fetch current available balance & cashback details
 */
router.get(
    '/details',
    authMiddleware,
    walletsController.getWalletDetails
);

/**
 * GET /api/v1/wallets/history
 * Fetch authenticated user's wallet transactions ledger (all records)
 */
router.get(
    '/history',
    authMiddleware,
    walletsController.getWalletHistory
);

/**
 * GET /api/v1/wallets/transactions
 * Get paginated wallet transaction history for authenticated user
 * Query params: ?page=1&limit=10
 */
router.get('/transactions', authMiddleware, walletsController.getTransactionHistory);

export default router;
