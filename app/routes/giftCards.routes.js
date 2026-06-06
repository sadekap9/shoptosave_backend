import express from 'express';
import {
    getGiftCards,
    createGiftCard,
    updateGiftCard,
    deleteGiftCard
} from '../controller/giftCards.controller.js';
import authenticate, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { giftCardUploadFields } from '../middlewares/giftCardUpload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createGiftCardSchema, updateGiftCardSchema } from '../validations/giftCard.validation.js';

const router = express.Router();

// Apply authentication and role authorization (Role 1 and 2 only)
router.use(authenticate);
router.use(authorizeRole([1, 2]));

// List all gift cards
router.get('/', getGiftCards);

// Create new gift card (allows up to 20 image uploads each for mobile/desktop fields)
router.post('/', 
    giftCardUploadFields, 
    validate(createGiftCardSchema), 
    createGiftCard
);

// Update gift card (allows up to 20 image uploads each for mobile/desktop fields)
router.patch('/:id', 
    giftCardUploadFields, 
    validate(updateGiftCardSchema), 
    updateGiftCard
);

// Delete gift card
router.delete('/:id', deleteGiftCard);

export default router;
