import express from 'express';
import {
    getGiftCards,
    getGiftCardById,
    createGiftCard,
    updateGiftCard,
    deleteGiftCard,
    getClientGiftCards,
    getClientGiftCardById,
    getTrendingGiftCards,
    getGiftCardsByStore,
    getGiftCardsByCategories,
    getGiftCardsByCategoryId
} from '../controller/giftCards/giftCards.controller.js';

import authenticate, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { giftCardUploadFields } from '../middlewares/giftCardUpload.middleware.js';
import { validate, validateParams } from '../middlewares/validate.middleware.js';
import {
    createGiftCardSchema,
    updateGiftCardSchema,
    giftCardIdParamSchema
} from '../validations/giftCard.validation.js';

const router = express.Router();


// Get active gift cards grouped by categories
router.get('/by-categories', getGiftCardsByCategories);

// Get gift cards for a specific category id (simplified response)
router.get('/get-categories/:id', getGiftCardsByCategoryId);

// Get top 6 trending gift cards by total_views
router.get('/trending', getTrendingGiftCards);

// Get all active gift cards for customers
router.get('/lists', getClientGiftCards);

// Get gift card details for customers
router.get('/lists/:id', validateParams(giftCardIdParamSchema), getClientGiftCardById);


// Get all gift cards (Admin list - legacy alias)
router.get(
    '/list',
    authenticate,
    authorizeRole([1, 2]),
    getGiftCards
);

// Get all gift cards (Admin list)
router.get(
    '/admin/list',
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
    validateParams(giftCardIdParamSchema),
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
    validateParams(giftCardIdParamSchema),
    giftCardUploadFields,
    validate(updateGiftCardSchema),
    updateGiftCard
);

// Delete gift card
router.delete(
    '/delete/:id',
    authenticate,
    authorizeRole([1]), // Super Admin only
    validateParams(giftCardIdParamSchema),
    deleteGiftCard
);


export default router;
