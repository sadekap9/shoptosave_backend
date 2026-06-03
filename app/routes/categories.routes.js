import express from 'express';
import { getCategories, getProductsByCategory, syncCategories, syncProducts, storeProduct } from '../controller/categories/categories.controller.js';
import authenticate from '../middlewares/verifyMiddleware.js';

const router = express.Router();

// Get all categories (Authenticated)
router.get('/', getCategories);

// Get products by category (Authenticated)
router.get('/:categoryId/products', authenticate, getProductsByCategory);

// Store products in database (Authenticated)
router.post('/products', authenticate, storeProduct);

// Sync categories with Woohoo (Manual trigger)
router.post('/sync', authenticate, syncCategories);

// Sync products with Woohoo (Manual trigger)
router.post('/products/sync', authenticate, syncProducts);

export default router;
