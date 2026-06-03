import express from 'express';
import {
    getStoreCategories,
    createStoreCategory,
    updateStoreCategory,
    deleteStoreCategory
} from '../controller/storeCategories.controller.js';
import authenticate from '../middlewares/verifyMiddleware.js';

const router = express.Router();

// Get all store categories (Open/Authenticated)
router.get('/list', getStoreCategories);

// Create store category (Authenticated/Admin only)
router.post('/add', authenticate, createStoreCategory);

// Update store category (Authenticated/Admin only)
router.put('/update/:id', authenticate, updateStoreCategory);

// Delete store category (Authenticated/Admin only)
router.delete('/delete/:id', authenticate, deleteStoreCategory);

export default router;
