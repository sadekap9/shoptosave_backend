import crypto from 'crypto';
import logger from '../utils/logger.js';

const sortObject = (obj) => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sortObject);
    }

    const sortedKeys = Object.keys(obj).sort();
    const result = {};
    for (const key of sortedKeys) {
        result[key] = sortObject(obj[key]);
    }
    return result;
};

/**
 * Generates the Woohoo Signature
 * @param {string} method - HTTP Method (GET, POST, etc.)
 * @param {string} url - The full URL being called
 * @param {Object} body - The request body (for POST/PUT)
 * @param {string} clientSecret - Your WOOHOO_CLIENT_SECRET
 * @returns {string} - The HMAC SHA512 signature
 */
export const generateSignature = (method, url, body, clientSecret) => {
    try {
        // 1. Normalize Method
        const normalizedMethod = method.toUpperCase();

        // 2. Normalize URL and sort query parameters alphabetically
        let signatureUrl = url;
        if (url.includes('?')) {
            const [baseUrl, queryString] = url.split('?');
            const searchParams = new URLSearchParams(queryString);
            const sortedParams = {};
            const keys = Array.from(searchParams.keys()).sort();
            for (const key of keys) {
                sortedParams[key] = searchParams.get(key);
            }
            const newQueryString = Object.keys(sortedParams)
                .map(key => `${key}=${sortedParams[key]}`)
                .join('&');
            signatureUrl = `${baseUrl}?${newQueryString}`;
        }

        const encodedUrl = encodeURIComponent(signatureUrl);

        let baseString = `${normalizedMethod}&${encodedUrl}`;

        // 3. Handle Body
        if (body && Object.keys(body).length > 0) {
            const sortedBody = sortObject(body);
            const bodyString = JSON.stringify(sortedBody);
            const encodedBody = encodeURIComponent(bodyString);
            baseString += `&${encodedBody}`;
        }

        // 4. Generate HMAC SHA512
        const hmac = crypto.createHmac('sha512', clientSecret);
        hmac.update(baseString);
        
        return hmac.digest('hex');
    } catch (error) {
        logger.error('Error generating Woohoo signature', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Generates the required headers for Woohoo API
 * @param {string} method 
 * @param {string} url 
 * @param {Object} body 
 * @param {string} token - OAuth Token
 * @returns {Object}
 */
export const getWoohooHeaders = (method, url, body = null, token = null, customClientSecret = null) => {
    const dateAtClient = new Date().toISOString();
    const clientSecret = customClientSecret || process.env.WOOHOO_CLIENT_SECRET;
    
    logger.info(`[Woohoo API Call] ${method} ${url}`);
    
    const signature = generateSignature(method, url, body, clientSecret);

    const headers = {
        'Content-Type': 'application/json',
        'dateAtClient': dateAtClient,
        'signature': signature,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
};

/**
 * Step 13: Build Woohoo Payload from order details, gift card SKU, and company billing configs
 */
export const buildWoohooPayload = (order = {}, giftCard = {}, companyConfig = {}) => {
    const refno = order.refno || `NEWTRONE_S2S-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const companyName = companyConfig?.name || 'Shop2Save Billing';
    const companyFirst = companyName.split(' ')[0] || 'Shop2Save';
    const companyLast = companyName.split(' ').slice(1).join(' ') || 'Billing';

    const sku = giftCard?.sku || order?.sku || 'EGCGBNIK001';
    const amount = parseFloat(order?.amount || order?.price || 0);
    const qty = parseInt(order?.qty || 1, 10);

    return {
        address: {
            firstname: companyFirst,
            lastname: companyLast,
            email: companyConfig?.email || 'billing@shoptosave.in',
            telephone: companyConfig?.mobile || '+918884520003',
            address1: companyConfig?.address1 || 'Koramangala',
            address2: companyConfig?.address2 || '',
            city: companyConfig?.city || 'Bangalore',
            state: companyConfig?.state || 'Karnataka',
            country: companyConfig?.country || 'IN',
            pincode: companyConfig?.pincode || '560095'
        },
        payments: [
            {
                code: 'disbursement',
                amount: amount
            }
        ],
        refno,
        syncOnly: (qty > 5) ? false : true,
        deliveryMode: 'API',
        products: [
            {
                sku: sku,
                qty: qty,
                price: order?.price ? parseFloat(order.price) : amount,
                recipient: {
                    name: order?.recipient_name || 'Customer',
                    email: order?.recipient_email || 'customer@example.com',
                    telephone: order?.recipient_mobile || '+918884520003',
                    message: order?.gift_message || ''
                }
            }
        ]
    };
};
