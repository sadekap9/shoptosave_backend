import express from 'express';
import {
    getOffers,
    getOfferById,
    createOffer,
    updateOffer,
    deleteOffer,
    changeOfferStatus,
    getOfferUsageHistory,
    getActiveOffers
} from '../controller/offers/offers.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
    createOfferSchema,
    updateOfferSchema,
    changeStatusSchema
} from '../validations/offers.validation.js';

const router = express.Router();

// Get all offers
router.get(
    '/list',
    authMiddleware,
    getOffers
);

// Get offer details
router.get(
    '/list/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    getOfferById
);

// Create offer
router.post(
    '/add',
    authMiddleware,
    authorizeRole([1, 2]),
    validate(createOfferSchema),
    createOffer
);

// Update offer
router.patch(
    '/update/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    validate(updateOfferSchema),
    updateOffer
);

// Update offer status
router.patch(
    '/update-status/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    validate(changeStatusSchema),
    changeOfferStatus
);

// Delete offer
router.delete(
    '/delete/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    deleteOffer
);

// Offer usage history
router.get(
    '/history',
    authMiddleware,
    authorizeRole([1, 2]),
    getOfferUsageHistory
);

// Get active offers
router.get(
    '/active',
    authMiddleware,
    getActiveOffers
);

export default router;