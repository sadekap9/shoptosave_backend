import express from 'express';
import {
    getAdminStoreCategories,
    getPublicStoreCategories,
    createStoreCategory,
    updateStoreCategory,
    deleteStoreCategory
} from '../controller/storeCategories/storeCategories.controller.js';
import authenticate, { authorizeMenu, authorizeRole } from '../middlewares/verifyMiddleware.js';
import upload from '../middlewares/upload.middleware.js';
import { createStoreCategorySchema, updateStoreCategorySchema, storeCategoryIdParamSchema } from '../validations/storeCategory.validation.js';
import { validate, validateParams } from '../middlewares/validate.middleware.js';


const router = express.Router();

// Get active store categories (Public)
router.get('/list', getPublicStoreCategories);

// Get all store categories including inactive (Admin)
router.get('/admin/list', authenticate, authorizeRole([1, 2]), getAdminStoreCategories);

// Create store category (Authenticated/Admin/Sub-Admin/User, parses logo image upload)
router.post('/add', authenticate, authorizeRole([1, 2]), // authorizeMenu('categories'),
    upload.single('logo'), validate(createStoreCategorySchema), createStoreCategory);

// Update store category (Authenticated/Admin/Sub-Admin/User, parses logo image upload)
router.patch('/update/:id', authenticate, authorizeRole([1, 2]), // authorizeMenu('categories'),
    validateParams(storeCategoryIdParamSchema), upload.single('logo'), validate(updateStoreCategorySchema), updateStoreCategory);

// Delete store category (Authenticated/Admin/Sub-Admin/User)
router.delete('/delete/:id', authenticate, authorizeRole([1, 2]), // authorizeMenu('categories'),
    validateParams(storeCategoryIdParamSchema), deleteStoreCategory);


export default router;
