import axios from 'axios';
import { getWoohooHeaders } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';

const BASE_URL = process.env.WOOHOO_API_BASE_URL; // e.g. https://sandbox.woohoo.in/rest
const AUTH_URL = process.env.WOOHOO_AUTH_URL;       // https://sandbox.woohoo.in/oauth2/verify
const TOKEN_URL = process.env.WOOHOO_TOKEN_URL;     // https://sandbox.woohoo.in/oauth2/token

// ─── AUTH ─────────────────────────────────────────────────────────────────────

/**
 * Step 1: Generate Authorization Code from Woohoo
 */
export const generateAuthorizationCode = async () => {
    const payload = {
        clientId: process.env.WOOHOO_CLIENT_ID,
        username: process.env.WOOHOO_USERNAME,
        password: process.env.WOOHOO_PASSWORD,
    };

    logger.info(`[Woohoo API Call] generateAuthorizationCode called on ${AUTH_URL}`);

    const headers = getWoohooHeaders('POST', AUTH_URL, payload);
    const response = await axios.post(AUTH_URL, payload, { headers, timeout: 30000 });
    return response.data;
};

/**
 * Step 2: Generate Bearer Token using an Authorization Code
 */
export const generateBearerToken = async (authorizationCode) => {
    const payload = {
        authorizationCode,
        clientId: process.env.WOOHOO_CLIENT_ID,
        clientSecret: process.env.WOOHOO_CLIENT_SECRET,
    };

    logger.info(`[Woohoo API Call] generateBearerToken called on ${TOKEN_URL}`);

    const response = await axios.post(TOKEN_URL, payload, { timeout: 30000 });
    return response.data;
};

/**
 * Get all categories from Woohoo
 */
export const getWoohooCategories = async (bearerToken) => {
    const url = `${BASE_URL}/v3/catalog/categories`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken);
    const response = await axios.get(url, { headers, timeout: 30000 });
    return response.data;
};

/**
 * Get products by category ID from Woohoo
 */
export const getWoohooProductsByCategory = async (bearerToken, categoryId) => {
    const url = `${BASE_URL}/v3/catalog/categories/${categoryId}/products`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken);
    const response = await axios.get(url, { headers, timeout: 30000 });
    return response.data;
};

/**
 * Get a single product by SKU from Woohoo
 */
export const getWoohooProduct = async (bearerToken, sku) => {
    const url = `${BASE_URL}/v3/catalog/products/${sku}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken);
    const response = await axios.get(url, { headers, timeout: 30000 });
    return response.data;
};

/**
 * Place an order on Woohoo
 */
export const placeWoohooOrder = async (bearerToken, orderPayload) => {
    const url = `${BASE_URL}/v3/orders`;
    const headers = getWoohooHeaders('POST', url, orderPayload, bearerToken);
    const response = await axios.post(url, orderPayload, { headers, timeout: 60000 });
    return response.data;
};

/**
 * Get order status by order ID
 */
export const getWoohooOrderStatus = async (bearerToken, orderId) => {
    const url = `${BASE_URL}/v3/orders/${orderId}/status`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken);
    const response = await axios.get(url, { headers, timeout: 30000 });
    return response.data;
};

/**
 * Get order details by reference number (refno)
 */
export const getWoohooOrderByRefNo = async (bearerToken, refno) => {
    const url = `${BASE_URL}/v3/orders?refno=${refno}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken);
    const response = await axios.get(url, { headers, timeout: 30000 });
    return response.data;
};

/**
 * Get activated cards for an order
 */
export const getActivatedCards = async (bearerToken, orderId, offset = 0, limit = 10) => {
    const url = `${BASE_URL}/v3/orders/${orderId}/cards?offset=${offset}&limit=${limit}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken);
    const response = await axios.get(url, { headers, timeout: 30000 });
    return response.data;
};

/**
 * Get order details by order ID
 */
export const getWoohooOrderDetails = async (bearerToken, orderId) => {
    const url = `${BASE_URL}/v3/orders/${orderId}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken);
    const response = await axios.get(url, { headers, timeout: 30000 });
    return response.data;
};

// ─── CARD BALANCE ─────────────────────────────────────────────────────────────

/**
 * Check card balance
 */
export const getWoohooCardBalance = async (bearerToken, cardNumber) => {
    const url = `${BASE_URL}/v3/balance`;
    const payload = { cardNumber };
    const headers = getWoohooHeaders('POST', url, payload, bearerToken);
    const response = await axios.post(url, payload, { headers, timeout: 30000 });
    return response.data;
};

// ─── RESEND ───────────────────────────────────────────────────────────────────

/**
 * Resend gift cards for an order
 */
export const resendWoohooCards = async (bearerToken, orderId, cards) => {
    const url = `${BASE_URL}/v3/orders/${orderId}/resend`;
    const payload = { cards };
    const headers = getWoohooHeaders('POST', url, payload, bearerToken);
    const response = await axios.post(url, payload, { headers, timeout: 30000 });
    return response.data;
};
