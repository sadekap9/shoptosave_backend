import express from 'express';
import * as profileController from '../controller/user/profile.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { updateProfileSchema, updateUserStatusSchema } from '../validations/user.validation.js';

const router = express.Router();

// Protected route to update profile
router.patch('/profile', authMiddleware, validate(updateProfileSchema), profileController.updateProfile);

// Protected route to list users (restricted to Admin/Sub-Admin only)
router.get('/get-all', authMiddleware, authorizeRole([1, 2]), profileController.listUsers);

// Protected route to change user status (restricted to Admin/Sub-Admin only)
router.patch('/status/:id', authMiddleware, authorizeRole([1, 2]), validate(updateUserStatusSchema), profileController.updateUserStatus);

// Protected route to get user by ID (restricted to Admin/Sub-Admin only)
router.get('/list/:id', authMiddleware, authorizeRole([1,2,3]), profileController.getUserById);

// Protected route to delete user by ID (restricted to Admin/Sub-Admin only)
router.delete('/delete/:id', authMiddleware, authorizeRole([1, 2, 3]), profileController.deleteUserByAdmin);

export default router;
