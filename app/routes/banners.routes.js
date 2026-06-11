import express from 'express';
import {
    getBanners,
    createBanner,
    updateBanner,
    deleteBanner
} from '../controller/banners.controller.js';
import authenticate, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import upload from '../middlewares/upload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createBannerSchema, updateBannerSchema } from '../validations/banner.validation.js';

const router = express.Router();

// List all banners (Authorized for Role 1 and 2)
router.get('/list', authenticate, authorizeRole([1, 2]), getBanners);

// Create new banner (Authorized for Role 1 and 2)
router.post('/add',
    authenticate,
    authorizeRole([1, 2]),
    upload.single('banner_image'),
    validate(createBannerSchema),
    createBanner
);

// Update banner (Authorized for Role 1 and 2)
router.patch('/update/:id',
    authenticate,
    authorizeRole([1, 2]),
    upload.single('banner_image'),
    validate(updateBannerSchema),
    updateBanner
);

// Delete banner (Authorized for Role 1 and 2)
router.delete('/delete/:id',
    authenticate,
    authorizeRole([1, 2]),
    deleteBanner
);

export default router;
