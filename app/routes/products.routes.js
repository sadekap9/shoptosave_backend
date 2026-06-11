import express from 'express';
import { getProductsByCategory, storeProduct, getProductBySku } from '../controller/products/products.controller.js';
import authenticate, { authorizeRole } from '../middlewares/verifyMiddleware.js';

const router = express.Router();

// Store products in database (Admin/Sub-Admin only)
router.post('/', authenticate, authorizeRole([1, 2]), storeProduct);

// Get products by category (Authenticated)
router.get('/category/:categoryId', authenticate, getProductsByCategory);

// Get products by category ID directly (Public)
router.get('/:categoryId', getProductsByCategory);

// Get a single product by SKU directly (Public)
router.get('/sku/:sku', getProductBySku);

export default router;
