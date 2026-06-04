import express from 'express';
import * as profileController from '../controller/user/profile.controller.js';
import authMiddleware from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { updateProfileSchema } from '../validations/user.validation.js';

const router = express.Router();

// Protected route to update profile
router.patch('/profile', authMiddleware, validate(updateProfileSchema), profileController.updateProfile);

export default router;
