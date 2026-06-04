import express from 'express';
import {
    getAdminStoreCategories,
    createStoreCategory,
    updateStoreCategory,
    deleteStoreCategory
} from '../controller/storeCategories.controller.js';
import authenticate, { authorizeMenu, authorizeRole } from '../middlewares/verifyMiddleware.js';
import upload from '../middlewares/upload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createStoreCategorySchema, updateStoreCategorySchema } from '../validations/storeCategory.validation.js';

const router = express.Router();

// Get all store categories including inactive
router.get('/admin/list', getAdminStoreCategories);

// Create store category (Authenticated/Admin/Sub-Admin/User, parses logo image upload)
router.post('/add', authenticate, authorizeRole([1, 2]), // authorizeMenu('categories'),
    upload.single('logo'), validate(createStoreCategorySchema), createStoreCategory);

// Update store category (Authenticated/Admin/Sub-Admin/User, parses logo image upload)
router.patch('/update/:id', authenticate, authorizeRole([1, 2]), // authorizeMenu('categories'),
    upload.single('logo'), validate(updateStoreCategorySchema), updateStoreCategory);

// Delete store category (Authenticated/Admin/Sub-Admin/User)
router.delete('/delete/:id', authenticate, authorizeRole([1, 2]), // authorizeMenu('categories'),
    deleteStoreCategory);

export default router;
