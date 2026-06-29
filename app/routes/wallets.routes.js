import express from 'express';
import * as walletsController from '../controller/wallets/wallets.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { requestTopupSchema } from '../validations/wallet.validation.js';

const router = express.Router();

/**
 * POST /api/v1/wallets/topup
 * User requests instant auto-approved wallet top-up
 */
router.post(
    '/topup',
    authMiddleware,
    validate(requestTopupSchema),
    walletsController.requestTopup
);

/**
 * GET /api/v1/wallets/history
 * Fetch authenticated user's wallet transactions ledger
 */
router.get(
    '/history',
    authMiddleware,
    walletsController.getWalletHistory
);

/**
 * GET /api/v1/wallets/details
 * Fetch current available balance & cashback details
 */
router.get(
    '/details',
    authMiddleware,
    walletsController.getWalletDetails
);

// ─── NEW SCHEMA-ALIGNED ENDPOINTS ─────────────────────────────────────────────

// Add money to wallet (creates pending top-up request)
router.post('/add-money', authMiddleware, walletsController.addMoney);

// Withdraw from wallet
router.post('/withdraw', authMiddleware, walletsController.withdraw);

// Get balance & transaction ledger (last 10)
router.get('/balance', authMiddleware, walletsController.getBalance);



export default router;
