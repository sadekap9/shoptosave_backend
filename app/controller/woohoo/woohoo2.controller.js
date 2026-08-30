import * as woohoo2Service from '../../services/woohoo/woohoo2.service.js';
import { getWoohoo2Token } from '../../services/categories/woohoo2Auth.service.js';
import pool from '../../config/dbConfig.js';
import logger from '../../utils/logger.js';
import { saveProductsToDB } from '../../services/products/products.service.js';

// Helper to extract Woohoo2 token from Authorization header
const extractToken = async (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return '';
};

// ─── AUTHENTICATION ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo2/auth/generate-code
 */
export const generateAuthCode = async (req, res) => {
    try {
        const result = await woohoo2Service.generateAuthorizationCode();

        const authorizationCode = result.authorizationCode;
        if (authorizationCode) {
            await pool.query(
                `INSERT INTO app_config (config_key, config_value, description)
                 VALUES ('woohoo2_auth_code', ?, 'Woohoo2 OAuth2 Authorization Code')
                 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
                [authorizationCode]
            );
            logger.info('Woohoo2 authorization code stored in app_config table');
        }

        return res.status(200).json({
            success: true,
            message: 'Authorization code generated successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in woohoo2 generateAuthCode details:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers,
            configUrl: error.config?.url,
            configHeaders: error.config?.headers,
            configData: error.config?.data
        });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || error.message || 'Failed to generate authorization code',
            errorDetails: {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            }
        });
    }
};

/**
 * POST /api/v1/woohoo2/auth/generate-token
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

        const result = await woohoo2Service.generateBearerToken(authorizationCode);

        const token = result.access_token || result.token;
        if (token) {
            await pool.query(
                `INSERT INTO app_config (config_key, config_value, description)
                 VALUES ('woohoo2_access_token', ?, 'Woohoo2 OAuth2 Access Token')
                 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
                [token]
            );

            let expiryTime;
            if (result.expires_in) {
                expiryTime = new Date(Date.now() + parseInt(result.expires_in, 10) * 1000).toISOString();
            } else if (result.expiresAt) {
                expiryTime = new Date(result.expiresAt).toISOString();
            } else if (result.expires_at) {
                expiryTime = new Date(result.expires_at).toISOString();
            } else {
                expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            }

            await pool.query(
                `INSERT INTO app_config (config_key, config_value, description)
                 VALUES ('woohoo2_token_expires_at', ?, 'Woohoo2 OAuth2 Access Token Expiry Time')
                 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
                [expiryTime]
            );

            logger.info('Woohoo2 bearer token and expiry stored in app_config table');
        }

        return res.status(200).json({
            success: true,
            message: 'Bearer token generated successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in woohoo2 generateBearerToken', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to generate bearer token',
            result: error.response?.data || {},
        });
    }
};

// ─── CATALOG ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/woohoo2/catalog/categories
 */
export const getCategories = async (req, res) => {
    try {
        const bearerToken = await extractToken(req);
        const result = await woohoo2Service.getWoohooCategories(bearerToken);

        return res.status(200).json({
            success: true,
            message: 'Categories fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getCategories (woohoo2) details:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers,
            configUrl: error.config?.url,
            configHeaders: error.config?.headers
        });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || error.message || 'Failed to fetch categories',
            errorDetails: {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            }
        });
    }
};

/**
 * GET /api/v1/woohoo2/catalog/categories/:categoryId/products
 */
export const getProductsByCategory = async (req, res) => {
    try {
        const bearerToken = await extractToken(req);
        const { categoryId } = req.params;
        const result = await woohoo2Service.getWoohooProductsByCategory(bearerToken, categoryId, req.query);

        return res.status(200).json({
            success: true,
            message: 'Products fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getProductsByCategory (woohoo2)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch products',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo2/catalog/products/:sku
 */
export const getProduct = async (req, res) => {
    try {
        const bearerToken = await extractToken(req);
        const { sku } = req.params;
        const result = await woohoo2Service.getWoohooProduct(bearerToken, sku, req.query);

        // Auto-save/sync fetched product details in woohoo_products table (background) with provider = 2
        if (result) {
            (async () => {
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

                await saveProductsToDB([result], categoryId, 2);
                logger.info(`Auto-saved single fetched Woohoo2 product SKU: ${sku} to DB (Category ID: ${categoryId}) (background)`);
            })().catch(err => {
                logger.error(`Woohoo2 product sync failed (background) for SKU: ${sku}`, { error: err.message });
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Product fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getProduct (woohoo2)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch product',
            result: error.response?.data || {},
        });
    }
};

// ─── ORDERS ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/woohoo2/orders
 */
export const placeOrder = async (req, res) => {
    const body = req.body || {};
    const refno = body.refno;
    const products = body.products || [];
    const sku = products[0]?.sku;
    const qty = products[0]?.qty;
    const price = products[0]?.price;
    const payments = body.payments || [];
    const paymentAmount = payments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
    const syncOnly = body.syncOnly ?? body.sync_only;
    const deliveryMode = body.deliveryMode;

    logger.info('[Woohoo2 Controller] Placing order request:', {
        refno,
        sku,
        qty,
        price,
        paymentAmount,
        syncOnly,
        deliveryMode
    });

    try {
        const bearerToken = await extractToken(req);
        const result = await woohoo2Service.placeWoohooOrder(bearerToken, body);
        logger.info('[Woohoo2 Controller] Order successfully placed:', {
            refno,
            sku,
            qty,
            price,
            resultCode: result.code,
            resultMessage: result.message
        });
        return res.status(200).json(result);
    } catch (error) {
        const errorData = error.response?.data;
        const errorStatus = error.response?.status || 500;
        
        logger.error('[Woohoo2 Controller] Order failed downstream:', {
            refno,
            sku,
            qty,
            price,
            paymentAmount,
            syncOnly,
            deliveryMode,
            errorMsg: error.message,
            statusCode: errorStatus,
            errorDetails: errorData
        });

        if (error.response) {
            return res.status(errorStatus).json(errorData);
        }
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to place order',
            result: {},
        });
    }
};

/**
 * GET /api/v1/woohoo2/orders/:orderId/status
 */
export const getOrderStatus = async (req, res) => {
    try {
        const bearerToken = await extractToken(req);
        const { orderId } = req.params;
        const result = await woohoo2Service.getWoohooOrderStatus(bearerToken, orderId);
        return res.status(200).json({
            success: true,
            message: 'Order status fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getOrderStatus (woohoo2)', { error: error.response?.data || error.message });
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch order status',
            result: {},
        });
    }
};

/**
 * GET /api/v1/woohoo2/orders/:orderId/cards
 */
export const getActivatedCards = async (req, res) => {
    try {
        const bearerToken = await extractToken(req);
        const { orderId } = req.params;
        const { offset = 0, limit = 10 } = req.query;
        const result = await woohoo2Service.getActivatedCards(bearerToken, orderId, offset, limit);
        return res.status(200).json({
            success: true,
            message: 'Activated cards fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getActivatedCards (woohoo2)', { error: error.response?.data || error.message });
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch activated cards',
            result: {},
        });
    }
};
