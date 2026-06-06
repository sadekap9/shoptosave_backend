import express from 'express';
import * as subAdminController from '../controller/subAdmin/subAdmin.controller.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createSubAdminSchema, updateSubAdminSchema } from '../validations/subAdmin.validation.js';

const router = express.Router();

// Apply authMiddleware and restrict to ADMIN only (role 1) for all sub-admin management routes
router.use(authMiddleware);
router.use(authorizeRole([1]));

// Add Sub-Admin
router.post('/add', validate(createSubAdminSchema), subAdminController.addSubAdmin);

// Update Sub-Admin
router.patch('/update/:id', validate(updateSubAdminSchema), subAdminController.updateSubAdmin);

// Delete Sub-Admin
router.delete('/delete/:id', subAdminController.deleteSubAdmin);

// List Sub-Admins
router.get('/list', subAdminController.listSubAdmins);

export default router;
