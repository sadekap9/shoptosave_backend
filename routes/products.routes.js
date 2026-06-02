import express from 'express';
import { getProductsByCategory, syncProducts, storeProduct } from '../controllers/products/products.controller.js';
import authenticate from '../middlewares/auth.middleware.js';

const router = express.Router();

// Store products in database (Authenticated)
router.post('/', authenticate, storeProduct);

// Sync products with Woohoo (Manual trigger) (Authenticated)
router.post('/sync', authenticate, syncProducts);

// Get products by category (Authenticated)
router.get('/category/:categoryId', authenticate, getProductsByCategory);

// Get products by category ID directly (Public)
router.get('/:categoryId', getProductsByCategory);

export default router;
