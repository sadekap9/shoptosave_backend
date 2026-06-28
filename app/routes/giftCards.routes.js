import express from 'express';
import {
    getGiftCards,
    getGiftCardById,
    createGiftCard,
    updateGiftCard,
    deleteGiftCard,
    getClientGiftCards,
    getClientGiftCardById,
    getGiftCardsByStore
} from '../controller/giftCards/giftCards.controller.js';

import authenticate, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { giftCardUploadFields } from '../middlewares/giftCardUpload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
    createGiftCardSchema,
    updateGiftCardSchema
} from '../validations/giftCard.validation.js';

const router = express.Router();


// Get all active gift cards for customers
router.get('/lists', getClientGiftCards);

// Get gift card details for customers
router.get('/lists/:id', getClientGiftCardById);


// Get all gift cards
router.get(
    '/list',
    authenticate,
    authorizeRole([1, 2]),
    getGiftCards
);

// Get gift cards by store ID
router.get(
    '/store/:storeId',
    authenticate,
    authorizeRole([1, 2]),
    getGiftCardsByStore
);

// Get gift card details by ID
router.get(
    '/:id',
    authenticate,
    authorizeRole([1, 2]),
    getGiftCardById
);

// Create gift card
router.post(
    '/add',
    authenticate,
    authorizeRole([1,2]), // Super Admin only
    giftCardUploadFields,
    validate(createGiftCardSchema),
    createGiftCard
);

// Update gift card
router.patch(
    '/update/:id',
    authenticate,
    authorizeRole([1,2]), // Super Admin only
    giftCardUploadFields,
    validate(updateGiftCardSchema),
    updateGiftCard
);

// Delete gift card
router.delete(
    '/delete/:id',
    authenticate,
    authorizeRole([1]), // Super Admin only
    deleteGiftCard
);

export default router;
