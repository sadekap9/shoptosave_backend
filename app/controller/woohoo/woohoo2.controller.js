import * as woohoo2Service from '../../services/woohoo/woohoo2.service.js';
import { getWoohoo2Token } from '../../services/categories/woohoo2Auth.service.js';
import pool from '../../config/dbConfig.js';
import logger from '../../utils/logger.js';

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
        logger.error('Error in woohoo2 generateAuthCode', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to generate authorization code',
            result: error.response?.data || {},
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
        const bearerToken = await getWoohoo2Token();
        const result = await woohoo2Service.getWoohooCategories(bearerToken);

        return res.status(200).json({
            success: true,
            message: 'Categories fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getCategories (woohoo2)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch categories',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo2/catalog/categories/:categoryId/products
 */
export const getProductsByCategory = async (req, res) => {
    try {
        const bearerToken = await getWoohoo2Token();
        const { categoryId } = req.params;
        const result = await woohoo2Service.getWoohooProductsByCategory(bearerToken, categoryId);

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
        const bearerToken = await getWoohoo2Token();
        const { sku } = req.params;
        const result = await woohoo2Service.getWoohooProduct(bearerToken, sku);

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
    try {
        const bearerToken = await getWoohoo2Token();
        const result = await woohoo2Service.placeWoohooOrder(bearerToken, req.body);
        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in placeOrder (woohoo2)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to place order',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo2/orders/:orderId/status
 */
export const getOrderStatus = async (req, res) => {
    try {
        const bearerToken = await getWoohoo2Token();
        const { orderId } = req.params;
        const result = await woohoo2Service.getWoohooOrderStatus(bearerToken, orderId);
        return res.status(200).json({
            success: true,
            message: 'Order status fetched successfully',
            result,
        });
    } catch (error) {
        logger.error('Error in getOrderStatus (woohoo2)', { error: error.response?.data || error.message });
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch order status',
            result: error.response?.data || {},
        });
    }
};

/**
 * GET /api/v1/woohoo2/orders/:orderId/cards
 */
export const getActivatedCards = async (req, res) => {
    try {
        const bearerToken = await getWoohoo2Token();
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
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.response?.data?.message || 'Failed to fetch activated cards',
            result: error.response?.data || {},
        });
    }
};
