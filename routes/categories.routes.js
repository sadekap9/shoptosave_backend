import express from 'express';
import * as woohooController from '../controllers/categories/categories.controller.js';
import authenticate from '../middlewares/auth.middleware.js';

const router = express.Router();

// Get all categories (Authenticated)
router.get('/', authenticate, woohooController.getCategories);

// Get products by category (Authenticated)
router.get('/:categoryId/products', authenticate, woohooController.getProductsByCategory);

// Sync categories with Woohoo (Manual trigger)
router.post('/sync', authenticate, woohooController.syncCategories);

// Sync products with Woohoo (Manual trigger)
router.post('/products/sync', authenticate, woohooController.syncProducts);

export default router;
