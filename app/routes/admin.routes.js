import express from 'express';
import * as adminController from '../controller/admin/admin.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.middleware.js';
import { listTopupsSchema, listOrdersSchema, manualRefundSchema } from '../validations/admin.validation.js';

const router = express.Router();

// List pending/approved/rejected top-up requests (Admins/Sub-Admins)
router.get(
    '/wallets/topups',
    authMiddleware,
    authorizeRole([1, 2]),
    validateQuery(listTopupsSchema),
    adminController.getTopups
);

// List all local gift card orders (Admins/Sub-Admins)
router.get(
    '/orders',
    authMiddleware,
    authorizeRole([1, 2]),
    validateQuery(listOrdersSchema),
    adminController.getOrdersList
);

// Retrieve details of a single local order (Admins/Sub-Admins)
router.get(
    '/order/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    adminController.getOrder
);

// Process manual refund for an order (Super-Admin only)
router.post(
    '/order/refund',
    authMiddleware,
    authorizeRole([1]),
    validate(manualRefundSchema),
    adminController.manualRefund
);

export default router;
