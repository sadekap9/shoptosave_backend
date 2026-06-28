import express from 'express';
import * as walletsController from '../controller/wallets/wallets.controller.js';
import * as walletController from '../controller/wallet.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { requestTopupSchema, approveTopupSchema } from '../validations/wallet.validation.js';

const router = express.Router();

/**
 * POST /api/v1/wallets/topup
 * User requests wallet top-up (Status pending = 1)
 */
router.post(
    '/topup',
    authMiddleware,
    validate(requestTopupSchema),
    walletsController.requestTopup
);

/**
 * POST /api/v1/wallets/topup/approve/:requestId
 * Admin/Sub-Admin approves or rejects the wallet top-up request
 */
router.post(
    '/topup/approve/:requestId',
    authMiddleware,
    authorizeRole([1, 2]), // Restricted to Super Admin (1) or Sub-Admin (2)
    validate(approveTopupSchema),
    walletsController.approveTopup
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
router.post('/add-money', authMiddleware, walletController.addMoney);

// Withdraw from wallet
router.post('/withdraw', authMiddleware, walletController.withdraw);

// Get balance & transaction ledger (last 10)
router.get('/balance', authMiddleware, walletController.getBalance);



export default router;
