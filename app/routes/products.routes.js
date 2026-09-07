import express from 'express';
import { getProductsByCategory, storeProduct, getProductBySku, syncProductBySku } from '../controller/products/products.controller.js';
import authenticate, { authorizeRole } from '../middlewares/verifyMiddleware.js';
import { validate, validateParams } from '../middlewares/validate.middleware.js';
import { productSchema, getProductsByCategoryParamsSchema, getProductBySkuParamsSchema } from '../validations/product.validation.js';

const router = express.Router();

// Store products in database (Admin/Sub-Admin only)
router.post('/', authenticate, authorizeRole([1, 2]), validate(productSchema), storeProduct);

// SKU-based Product Sync (Admin/Sub-Admin only)
router.post('/sync-sku', authenticate, authorizeRole([1, 2]), syncProductBySku);
router.post('/sync-sku/:sku', authenticate, authorizeRole([1, 2]), syncProductBySku);
router.get('/sync-sku/:sku', authenticate, authorizeRole([1, 2]), syncProductBySku);

// Get products by category (Authenticated)
router.get('/category/:categoryId', authenticate, validateParams(getProductsByCategoryParamsSchema), getProductsByCategory);

// Get products by category ID directly (Public)
router.get('/:categoryId', validateParams(getProductsByCategoryParamsSchema), getProductsByCategory);

// Get a single product by SKU directly (Public)
router.get('/sku/:sku', validateParams(getProductBySkuParamsSchema), getProductBySku);

export default router;


