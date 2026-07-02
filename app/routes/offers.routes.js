import express from 'express';
import * as offersController from '../controller/offers/offers.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createOfferSchema, updateOfferSchema, changeStatusSchema, applyPromoSchema } from '../validations/offers.validation.js';

const router = express.Router();

// Get all offers (restricted to admin & sub-admin roles)
router.get(
    '/list',
    authMiddleware,
    authorizeRole([1, 2]),
    offersController.getOffers
);

// Get single offer details
router.get(
    '/list/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    offersController.getOfferById
);

// Create a new offer
router.post(
    '/add',
    authMiddleware,
    authorizeRole([1, 2]),
    validate(createOfferSchema),
    offersController.createOffer
);

// Update an existing offer
router.patch(
    '/update/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    validate(updateOfferSchema),
    offersController.updateOffer
);

// Delete an offer
router.delete(
    '/delete/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    offersController.deleteOffer
);

// Change status of an offer (Active / Inactive)
router.patch(
    '/update-status/:id',
    authMiddleware,
    authorizeRole([1, 2]),
    validate(changeStatusSchema),
    offersController.changeOfferStatus
);

// View offer usage history logs
router.get(
    '/get-history',
    authMiddleware,
    authorizeRole([1, 2]),
    offersController.getOfferUsageHistory
);

// --- User Offer Routes ---
// Get active and valid offers (non-expired)
router.get(
    '/active',
    authMiddleware,
    offersController.getActiveOffers
);

// Validate and apply promo code
router.post(
    '/apply-promo',
    authMiddleware,
    validate(applyPromoSchema),
    offersController.applyPromoCode
);

export default router;
