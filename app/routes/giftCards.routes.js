import express from 'express';
import {
    getGiftCards,
    getGiftCardById,
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
router.get('/list', getGiftCards);

// Get single gift card details by ID
router.get('/:id', getGiftCardById);

// Create new gift card (allows up to 20 image uploads each for mobile/desktop fields)
router.post('/add', 
    giftCardUploadFields, 
    validate(createGiftCardSchema), 
    createGiftCard
);

// Update gift card (allows up to 20 image uploads each for mobile/desktop fields)
router.patch('/update/:id', 
    giftCardUploadFields, 
    validate(updateGiftCardSchema), 
    updateGiftCard
);

// Delete gift card
router.delete('/delete/:id', deleteGiftCard);

export default router;
