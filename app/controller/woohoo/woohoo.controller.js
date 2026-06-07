import * as woohooService from '../../services/woohoo/woohoo.service.js';
import { saveCategoriesToDB, getCategoriesFromDB } from '../../services/categories/categories.service.js';
import pool from '../../config/dbConfig.js';
import logger from '../../utils/logger.js';
import { saveProductsToDB } from '../../services/products/products.service.js';
import fs from 'fs';

// ─── AUTHENTICATION ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo/auth/generate-code
 * Generate Authorization Code from Woohoo (Step 1 of OAuth2)
 */
export const generateAuthCode = async (req, res) => {
    try {
        const result = await woohooService.generateAuthorizationCode();

        // Store authorizationCode in the database
        const authorizationCode = result.authorizationCode;
        if (authorizationCode) {
            await pool.query(
                `INSERT INTO app_config (config_key, config_value, description)
                 VALUES ('woohoo_auth_code', ?, 'Woohoo OAuth2 Authorization Code')
                 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
                [authorizationCode]
            );
            logger.info('Woohoo authorization code stored in app_config table');
        }

        return res.status(200).json({
            success: true,
            message: 'Authorization code generated successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in generateAuthCode', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to generate authorization code',
            result: error.response?.data || {},
        });
    }
};

/**
 * POST /api/v1/woohoo/auth/generate-token
 * Generate Bearer Token from Woohoo (Step 2 of OAuth2)
 * Body: { authorizationCode }
 */
export const generateBearerToken = async (req, res) => {
    try {
        const { authorizationCode } = req.body;
        if (!authorizationCode) {
            return res.status(400).json({
                success: false,
                message: 'authorizationCode is required',
                result: {},
            });
        }

        const result = await woohooService.generateBearerToken(authorizationCode);

        // Store bearerToken in the database
        const token = result.token;
        if (token) {
            await pool.query(
                `INSERT INTO app_config (config_key, config_value, description)
                 VALUES ('woohoo_bearer_token', ?, 'Woohoo OAuth2 Bearer Token')
                 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
                [token]
            );
            logger.info('Woohoo bearer token stored in app_config table');
        }

        return res.status(200).json({
            success: true,
            message: 'Bearer token generated successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in generateBearerToken', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to generate bearer token',
            result: error.response?.data || {},
        });
    }
};

// ─── CATALOG ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/woohoo/catalog/categories
 * Get all gift card categories from Woohoo
 * Header: Authorization: Bearer <token>
 */
export const getCategories = async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.split(' ')[1];
        if (!bearerToken) {
            return res.status(401).json({ success: false, message: 'Woohoo Bearer token required', result: {} });
        }
        const result = await woohooService.getWoohooCategories(bearerToken);

        // Save categories to database
        if (result) {
            const categoriesToSync = Array.isArray(result) ? result : [result];
            await saveCategoriesToDB(categoriesToSync);
            logger.info(`Successfully stored fetched categories to database`);
        }

        return res.status(200).json({
            success: true,
            message: 'Categories fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getCategories (woohoo)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch categories',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo/catalog/db-categories or /api/v1/woohoo/catalog/categories/db
 * Get all gift card categories from local database (does not query Woohoo)
 */
export const getDBCategories = async (req, res) => {
    try {
        const categories = await getCategoriesFromDB();
        return res.status(200).json({
            success: true,
            message: 'Categories fetched from database successfully',
            result: categories,
        });
    } catch (error) {
        logger.error('Error in getDBCategories (woohoo)', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch categories from database',
            result: {},
        });
    }
};

/**
 * GET /api/v1/woohoo/catalog/categories/:categoryId/products
 * Get products in a category from Woohoo
 */
export const getProductsByCategory = async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.split(' ')[1];
        if (!bearerToken) {
            return res.status(401).json({ success: false, message: 'Woohoo Bearer token required', result: {} });
        }
        const { categoryId } = req.params;
        const result = await woohooService.getWoohooProductsByCategory(bearerToken, categoryId);

        // Debug log to scratch/woohoo_result.json
        try {
            if (!fs.existsSync('scratch')) {
                fs.mkdirSync('scratch', { recursive: true });
            }
            fs.writeFileSync('scratch/woohoo_result.json', JSON.stringify(result, null, 2));
            logger.info('Dumped live category products response to scratch/woohoo_result.json');
        } catch (err) {
            logger.error('Failed to dump debug log', { error: err.message });
        }

        // Auto-save/sync fetched products in woohoo_products table
        const productsToSave = result.products || (Array.isArray(result) ? result : []);
        logger.info(`Checking products to save. Result is array: ${Array.isArray(result)}. Result.products exists: ${!!result.products}. Products count: ${productsToSave.length}`);

        if (productsToSave && productsToSave.length > 0) {
            // Get local category ID
            let [[localCategory]] = await pool.query(
                'SELECT id FROM woohoo_categories WHERE woohoo_category_id = ?',
                [categoryId]
            );

            // If it doesn't exist locally, insert a stub category to satisfy foreign key constraints
            if (!localCategory) {
                const [insertCat] = await pool.query(
                    'INSERT INTO woohoo_categories (woohoo_category_id, name, is_active) VALUES (?, ?, 1)',
                    [categoryId, `Category ${categoryId}`]
                );
                localCategory = { id: insertCat.insertId };
            }

            // Save products
            await saveProductsToDB(productsToSave, localCategory.id);
            logger.info(`Auto-saved ${productsToSave.length} products for category ${categoryId} to DB`);
        }

        return res.status(200).json({
            success: true,
            message: 'Products fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getProductsByCategory (woohoo)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch products',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo/catalog/products/:sku
 * Get a single product by SKU from Woohoo
 */
export const getProduct = async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.split(' ')[1];
        if (!bearerToken) {
            return res.status(401).json({ success: false, message: 'Woohoo Bearer token required', result: {} });
        }
        const { sku } = req.params;
        const result = await woohooService.getWoohooProduct(bearerToken, sku);

        // Auto-save/sync fetched product details in woohoo_products table
        if (result) {
            let woohooCategoryId = null;
            if (result.category_id) {
                woohooCategoryId = result.category_id;
            } else if (result.categories && result.categories.length > 0) {
                const firstCat = result.categories[0];
                woohooCategoryId = (firstCat && typeof firstCat === 'object') ? firstCat.id : firstCat;
            }

            let categoryId = null;
            if (woohooCategoryId) {
                const [[cat]] = await pool.query('SELECT id FROM woohoo_categories WHERE woohoo_category_id = ?', [woohooCategoryId]);
                if (cat) {
                    categoryId = cat.id;
                } else {
                    const [insCat] = await pool.query(
                        'INSERT INTO woohoo_categories (woohoo_category_id, name, is_active) VALUES (?, ?, 1)',
                        [woohooCategoryId, `Category ${woohooCategoryId}`]
                    );
                    categoryId = insCat.insertId;
                }
            } else {
                // Find or insert default category
                const [[stubCat]] = await pool.query("SELECT id FROM woohoo_categories LIMIT 1");
                if (stubCat) {
                    categoryId = stubCat.id;
                } else {
                    const [insCat] = await pool.query(
                        "INSERT INTO woohoo_categories (woohoo_category_id, name, is_active) VALUES ('default-cat', 'Default Category', 1)"
                    );
                    categoryId = insCat.insertId;
                }
            }

            await saveProductsToDB([result], categoryId);
            logger.info(`Auto-saved single fetched product SKU: ${sku} to DB (Category ID: ${categoryId})`);
        }

        return res.status(200).json({
            success: true,
            message: 'Product fetched and synced successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getProduct (woohoo)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch product',
            result: error.response?.data || {},
        });
    }
};

// ─── ORDERS ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo/orders
 * Place a new order on Woohoo
 * Body: { address, payments, refno, syncOnly, deliveryMode, products }
 */
export const placeOrder = async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.split(' ')[1];
        if (!bearerToken) {
            return res.status(401).json({ success: false, message: 'Woohoo Bearer token required', result: {} });
        }
        const result = await woohooService.placeWoohooOrder(bearerToken, req.body);
        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in placeOrder (woohoo)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to place order',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo/orders/:orderId/status
 * Get order status from Woohoo
 */
export const getOrderStatus = async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.split(' ')[1];
        if (!bearerToken) {
            return res.status(401).json({ success: false, message: 'Woohoo Bearer token required', result: {} });
        }
        const { orderId } = req.params;
        const result = await woohooService.getWoohooOrderStatus(bearerToken, orderId);
        return res.status(200).json({
            success: true,
            message: 'Order status fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getOrderStatus (woohoo)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch order status',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo/orders/:orderId/cards
 * Get activated cards for an order
 * Query: ?offset=0&limit=10
 */
export const getActivatedCards = async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.split(' ')[1];
        if (!bearerToken) {
            return res.status(401).json({ success: false, message: 'Woohoo Bearer token required', result: {} });
        }
        const { orderId } = req.params;
        const { offset = 0, limit = 10 } = req.query;
        const result = await woohooService.getActivatedCards(bearerToken, orderId, offset, limit);
        return res.status(200).json({
            success: true,
            message: 'Activated cards fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getActivatedCards (woohoo)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch activated cards',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo/orders/:orderId
 * Get full order details from Woohoo
 */
export const getOrderDetails = async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.split(' ')[1];
        if (!bearerToken) {
            return res.status(401).json({ success: false, message: 'Woohoo Bearer token required', result: {} });
        }
        const { orderId } = req.params;
        const result = await woohooService.getWoohooOrderDetails(bearerToken, orderId);
        return res.status(200).json({
            success: true,
            message: 'Order details fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getOrderDetails (woohoo)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch order details',
            result: error.response?.data || {},
        });
    }
};

// ─── CARD BALANCE ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo/balance
 * Check gift card balance
 * Body: { cardNumber }
 */
export const getCardBalance = async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.split(' ')[1];
        if (!bearerToken) {
            return res.status(401).json({ success: false, message: 'Woohoo Bearer token required', result: {} });
        }
        const { cardNumber } = req.body;
        if (!cardNumber) {
            return res.status(400).json({ success: false, message: 'cardNumber is required', result: {} });
        }
        const result = await woohooService.getWoohooCardBalance(bearerToken, cardNumber);
        return res.status(200).json({
            success: true,
            message: 'Card balance fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getCardBalance (woohoo)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch card balance',
            result: error.response?.data || {},
        });
    }
};

// ─── RESEND ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo/orders/:orderId/resend
 * Resend gift cards for an order
 * Body: { cards: [{ id, name, telephone, email }] }
 */
export const resendCards = async (req, res) => {
    try {
        const bearerToken = req.headers.authorization?.split(' ')[1];
        if (!bearerToken) {
            return res.status(401).json({ success: false, message: 'Woohoo Bearer token required', result: {} });
        }
        const { orderId } = req.params;
        const { cards } = req.body;
        if (!cards || !Array.isArray(cards) || cards.length === 0) {
            return res.status(400).json({ success: false, message: 'cards array is required', result: {} });
        }
        const result = await woohooService.resendWoohooCards(bearerToken, orderId, cards);
        return res.status(200).json({
            success: true,
            message: 'Cards resent successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in resendCards (woohoo)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to resend cards',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo/products
 * Get list of synced Woohoo products for dropdown selection (only id, name, sku)
 */
export const getSyncedProductsList = async (req, res) => {
    try {
        const [products] = await pool.query(
            'SELECT id, product_name AS name, sku FROM woohoo_products WHERE status = 1 ORDER BY product_name ASC'
        );

        return res.status(200).json({
            success: true,
            errors: [],
            result: {
                message: 'Synced products fetched successfully',
                data: products
            }
        });
    } catch (error) {
        logger.error('Error in getSyncedProductsList', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * GET /api/v1/woohoo/products/sku/:sku
 * Get complete details of a synced Woohoo product by SKU
 */
export const getSyncedProductBySku = async (req, res) => {
    try {
        const { sku } = req.params;
        const [[product]] = await pool.query(
            'SELECT * FROM woohoo_products WHERE sku = ?',
            [sku]
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                errors: [{ message: 'Woohoo product not found' }],
                result: {}
            });
        }

        return res.status(200).json({
            success: true,
            errors: [],
            result: {
                message: 'Synced product details fetched successfully',
                data: product
            }
        });
    } catch (error) {
        logger.error('Error in getSyncedProductBySku', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * GET /api/v1/woohoo/products/:id
 * Get complete details of a synced Woohoo product by ID
 */
export const getSyncedProductDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const [[product]] = await pool.query(
            'SELECT * FROM woohoo_products WHERE id = ?',
            [id]
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                errors: [{ message: 'Woohoo product not found' }],
                result: {}
            });
        }

        return res.status(200).json({
            success: true,
            errors: [],
            result: {
                message: 'Synced product details fetched successfully',
                data: product
            }
        });
    } catch (error) {
        logger.error('Error in getSyncedProductDetails', { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};
