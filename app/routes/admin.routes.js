import express from 'express';
import * as adminController from '../controller/admin/admin.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate, validateQuery } from '../middlewares/validate.middleware.js';
import { listTopupsSchema, listOrdersSchema, manualRefundSchema } from '../validations/admin.validation.js';

const router = express.Router();

/**
 * GET /api/v1/admin/wallets/topups
 * List pending/approved/rejected top-up requests
 * Restricted to Admins/Sub-Admins (roles 1, 2)
 */
router.get(
    '/wallets/topups',
    authMiddleware,
    authorizeRole([1, 2]),
    validateQuery(listTopupsSchema),
    adminController.getTopups
);

/**
 * GET /api/v1/admin/orders
 * List all local gift card orders
 * Restricted to Admins/Sub-Admins (roles 1, 2)
 */
router.get(
    '/orders',
    authMiddleware,
    authorizeRole([1, 2]),
    validateQuery(listOrdersSchema),
    adminController.getOrdersList
);

/**
 * GET /api/v1/admin/order/:id
 * Retrieve details of a single local order
 * Restricted to Admins/Sub-Admins (roles 1, 2)
 */
router.get(
    '/order/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    adminController.getOrder
);

/**
 * POST /api/v1/admin/order/refund
 * Process manual refund for an order
 * Restricted to Admin roles (Super-Admin 1)
 */
router.post(
    '/order/refund',
    authMiddleware,
    authorizeRole([1]), // Strictly Super Admin only
    validate(manualRefundSchema),
    adminController.manualRefund
);

export default router;
