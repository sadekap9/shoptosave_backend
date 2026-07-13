import express from 'express';
import * as profileController from '../controller/user/profile.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import upload from '../middlewares/upload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { updateProfileSchema, updateUserStatusSchema } from '../validations/user.validation.js';

const router = express.Router();

// Update user profile
router.patch('/profile', authMiddleware, upload.single('profile_image'), validate(updateProfileSchema), profileController.updateProfile);

// List all users (Admins/Sub-Admins)
router.get('/get-all', authMiddleware, authorizeRole([1, 2]), profileController.listUsers);

// Change user status (Admins/Sub-Admins)
router.patch('/status/:id', authMiddleware, authorizeRole([1, 2]), validate(updateUserStatusSchema), profileController.updateUserStatus);

// Get user profile details by ID
router.get('/list/:id', authMiddleware, authorizeRole([1, 2, 3]), profileController.getUserById);

// Delete user by ID (Admins/Sub-Admins)
router.delete('/delete/:id', authMiddleware, authorizeRole([1, 2]), profileController.deleteUserByAdmin);

export default router;
