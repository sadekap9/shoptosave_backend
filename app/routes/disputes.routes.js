import express from 'express';
import * as disputesController from '../controller/disputes/disputes.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate, validateParams } from '../middlewares/validate.middleware.js';
import { 
    createDisputeSchema, 
    updateDisputeStatusSchema, 
    disputeIdParamSchema 
} from '../validations/dispute.validation.js';

const router = express.Router();

/**
 * POST /api/v1/disputes
 * Create a new dispute for a given order item
 */
router.post(
    '/',
    authMiddleware,
    validate(createDisputeSchema),
    disputesController.createDispute
);

/**
 * GET /api/v1/disputes
 * Retrieve list of disputes (admin gets all, user gets their own)
 */
router.get(
    '/',
    authMiddleware,
    disputesController.getDisputes
);

/**
 * GET /api/v1/disputes/:disputeId
 * Fetch single dispute details
 */
router.get(
    '/:disputeId',
    authMiddleware,
    validateParams(disputeIdParamSchema),
    disputesController.getDisputeById
);

/**
 * PUT /api/v1/disputes/:disputeId/status
 * Update status of a dispute (Super-Admin [1] & Sub-Admin [2] only)
 */
router.put(
    '/:disputeId/status',
    authMiddleware,
    authorizeRole([1, 2]),
    validateParams(disputeIdParamSchema),
    validate(updateDisputeStatusSchema),
    disputesController.updateDisputeStatus
);

export default router;
