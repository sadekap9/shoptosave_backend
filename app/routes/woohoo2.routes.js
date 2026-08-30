import express from 'express';
import * as woohoo2Controller from '../controller/woohoo/woohoo2.controller.js';
import { runWoohoo2Tests } from '../../woohoo2.js';

const router = express.Router();

// Step 1: Generate Authorization Code from Woohoo2 UAT
router.post('/auth/generate-code', woohoo2Controller.generateAuthCode);

// Step 2: Exchange Authorization Code for a Bearer Token
router.post('/auth/generate-token', woohoo2Controller.generateBearerToken);

// Fetch all gift card categories from Woohoo2 UAT
router.get('/catalog/categories', woohoo2Controller.getCategories);

// Fetch products in a given category
router.get('/catalog/categories/:categoryId/products', woohoo2Controller.getProductsByCategory);

// Fetch a single product by SKU
router.get('/catalog/products/:sku', woohoo2Controller.getProduct);

// Place a new gift card order
router.post('/orders', woohoo2Controller.placeOrder);

// Get the status of an order
router.get('/orders/:orderId/status', woohoo2Controller.getOrderStatus);

// Get activated cards for an order
router.get('/orders/:orderId/cards', woohoo2Controller.getActivatedCards);

// Route to trigger testing all Woohoo2 APIs sequentially
router.get('/test-all', async (req, res) => {
    try {
        const results = await runWoohoo2Tests();
        return res.status(results.overall?.success ? 200 : 500).json(results);
    } catch (error) {
        return res.status(500).json({
            overall: { success: false, error: error.message }
        });
    }
});

export default router;
