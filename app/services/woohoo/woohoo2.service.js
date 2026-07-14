import axios from 'axios';
import { getWoohooHeaders } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';

const getBaseUrl = () => process.env.WOOHOO2_API_BASE_URL || 'https://sandbox.woohoo.in/rest';
const getAuthUrl = () => process.env.WOOHOO2_AUTH_URL || 'https://sandbox.woohoo.in/oauth2/verify';
const getTokenUrl = () => process.env.WOOHOO2_TOKEN_URL || 'https://sandbox.woohoo.in/oauth2/token';

/**
 * Step 1: Generate Authorization Code from Woohoo
 */
export const generateAuthorizationCode = async () => {
    const payload = {
        clientId: process.env.WOOHOO2_CLIENT_ID,
        username: process.env.WOOHOO2_USERNAME,
        password: process.env.WOOHOO2_PASSWORD,
    };

    const authUrl = getAuthUrl();
    logger.info(`[Woohoo2 API Call] generateAuthorizationCode called on ${authUrl}`);

    const headers = getWoohooHeaders('POST', authUrl, payload, null, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.post(authUrl, payload, { headers, timeout: 10000 });
    return response.data;
};

/**
 * Step 2: Generate Bearer Token using an Authorization Code
 */
export const generateBearerToken = async (authorizationCode) => {
    const payload = {
        authorizationCode,
        clientId: process.env.WOOHOO2_CLIENT_ID,
        clientSecret: process.env.WOOHOO2_CLIENT_SECRET,
    };

    const tokenUrl = getTokenUrl();
    logger.info(`[Woohoo2 API Call] generateBearerToken called on ${tokenUrl}`);

    const response = await axios.post(tokenUrl, payload, { timeout: 10000 });
    return response.data;
};

/**
 * Get all categories from Woohoo
 */
export const getWoohooCategories = async (bearerToken, query = {}) => {
    const queryString = new URLSearchParams(query).toString();
    const url = `${getBaseUrl()}/v3/catalog/categories${queryString ? '?' + queryString : ''}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
};

/**
 * Get products by category ID from Woohoo
 */
export const getWoohooProductsByCategory = async (bearerToken, categoryId, query = {}) => {
    const queryString = new URLSearchParams(query).toString();
    const url = `${getBaseUrl()}/v3/catalog/categories/${categoryId}/products${queryString ? '?' + queryString : ''}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
};

/**
 * Get a single product by SKU from Woohoo
 */
export const getWoohooProduct = async (bearerToken, sku, query = {}) => {
    const queryString = new URLSearchParams(query).toString();
    const url = `${getBaseUrl()}/v3/catalog/products/${sku}${queryString ? '?' + queryString : ''}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
};

/**
 * Place an order on Woohoo
 */
export const placeWoohooOrder = async (bearerToken, orderPayload) => {
    const url = `${getBaseUrl()}/v3/orders`;
    const headers = getWoohooHeaders('POST', url, orderPayload, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.post(url, orderPayload, { headers, timeout: 10000 });
    return response.data;
};

/**
 * Get order status by order ID
 */
export const getWoohooOrderStatus = async (bearerToken, orderId) => {
    const url = `${getBaseUrl()}/v3/orders/${orderId}/status`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
};

/**
 * Get order details by reference number (refno)
 */
export const getWoohooOrderByRefNo = async (bearerToken, refno) => {
    const url = `${getBaseUrl()}/v3/orders?refno=${refno}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
};

/**
 * Get activated cards for an order
 */
export const getActivatedCards = async (bearerToken, orderId, offset = 0, limit = 10) => {
    const url = `${getBaseUrl()}/v3/orders/${orderId}/cards?offset=${offset}&limit=${limit}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
};

/**
 * Get order details by order ID
 */
export const getWoohooOrderDetails = async (bearerToken, orderId) => {
    const url = `${getBaseUrl()}/v3/orders/${orderId}`;
    const headers = getWoohooHeaders('GET', url, null, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
};

// ─── CARD BALANCE ─────────────────────────────────────────────────────────────

/**
 * Check card balance
 */
export const getWoohooCardBalance = async (bearerToken, cardNumber) => {
    const url = `${getBaseUrl()}/v3/balance`;
    const payload = { cardNumber };
    const headers = getWoohooHeaders('POST', url, payload, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.post(url, payload, { headers, timeout: 10000 });
    return response.data;
};

// ─── RESEND ───────────────────────────────────────────────────────────────────

/**
 * Resend gift cards for an order
 */
export const resendWoohooCards = async (bearerToken, orderId, cards) => {
    const url = `${getBaseUrl()}/v3/orders/${orderId}/resend`;
    const payload = { cards };
    const headers = getWoohooHeaders('POST', url, payload, bearerToken, process.env.WOOHOO2_CLIENT_SECRET);
    const response = await axios.post(url, payload, { headers, timeout: 10000 });
    return response.data;
};
