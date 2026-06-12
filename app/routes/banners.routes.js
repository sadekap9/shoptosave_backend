import express from 'express';
import {
    getBanners,
    getBannerById,
    createBanner,
    updateBanner,
    deleteBanner
} from '../controller/banners.controller.js';
import authenticate, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import upload from '../middlewares/upload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createBannerSchema, updateBannerSchema } from '../validations/banner.validation.js';

const router = express.Router();

// List all banners (Authorized for Admin, Sub-Admin, and Customer/User)
router.get('/list', authenticate, authorizeRole([1, 2]), getBanners);

// Get a single banner or list of banners by ID(s) (Public endpoint)
router.get('/list/:id', getBannerById);

// Create new banner (Authorized for Role 1 and 2 only)
router.post('/add',
    authenticate,
    authorizeRole([1, 2]),
    upload.single('banner_image'),
    validate(createBannerSchema),
    createBanner
);

// Update banner (Authorized for Role 1 and 2 only)
router.patch('/update/:id',
    authenticate,
    authorizeRole([1, 2]),
    upload.single('banner_image'),
    validate(updateBannerSchema),
    updateBanner
);

// Delete banner (Authorized for Role 1 and 2 only)
router.delete('/delete/:id',
    authenticate,
    authorizeRole([1, 2]),
    deleteBanner
);

export default router;

