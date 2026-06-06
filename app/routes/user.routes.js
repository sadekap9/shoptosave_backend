import express from 'express';
import * as profileController from '../controller/user/profile.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { updateProfileSchema } from '../validations/user.validation.js';

const router = express.Router();

// Protected route to update profile
router.patch('/profile', authMiddleware, validate(updateProfileSchema), profileController.updateProfile);

// Protected route to list users (restricted to Admin/Sub-Admin only)
router.get('/get-all', authMiddleware, authorizeRole([1, 2]), profileController.listUsers);

// Protected route to get user by ID (restricted to Admin/Sub-Admin only)
router.get('/:id', authMiddleware, authorizeRole([1, 2]), profileController.getUserById);

export default router;
