import express from 'express';
import * as profileController from '../controllers/user/profile.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { updateProfileSchema } from '../validations/user.validation.js';

const router = express.Router();

// Protected route to update profile
router.put('/profile', authMiddleware, validate(updateProfileSchema), profileController.updateProfile);

export default router;
