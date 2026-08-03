import express from 'express';
import * as sellGiftCardController from '../controller/sellGiftCard/sellGiftCard.controller.js';
import authMiddleware from '../middlewares/verifyMiddleware.js';
import { validate, validateParams } from '../middlewares/validate.middleware.js';
import { submitSellRequestSchema, requestIdParamSchema } from '../validations/sellGiftCard.validation.js';

const router = express.Router();

router.get('/brands', sellGiftCardController.searchGiftCardBrands);
router.post('/', authMiddleware, validate(submitSellRequestSchema), sellGiftCardController.submitSellRequest);
router.get('/', authMiddleware, sellGiftCardController.getMyRequests);
router.get('/:id', authMiddleware, validateParams(requestIdParamSchema), sellGiftCardController.getRequestDetails);

export default router;
