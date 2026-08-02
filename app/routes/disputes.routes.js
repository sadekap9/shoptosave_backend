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
router.post(
    '/create',
    authMiddleware,
    validate(createDisputeSchema),
    disputesController.createDispute
);

router.get(
    '/list',
    authMiddleware,
    disputesController.getDisputes
);
router.get(
    '/list/:disputeId',
    authMiddleware,
    validateParams(disputeIdParamSchema),
    disputesController.getDisputeById
);

router.patch(
    '/:disputeId/status',
    authMiddleware,
    authorizeRole([1, 2]),
    validateParams(disputeIdParamSchema),
    validate(updateDisputeStatusSchema),
    disputesController.updateDisputeStatus
);

export default router;
