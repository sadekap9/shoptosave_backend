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

        // 2. Normalize URL (Remove protocol and host for the base string if needed, 
        // but Postman uses the full URL encoded. We will follow Postman logic.)
        const encodedUrl = encodeURIComponent(url);

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
export const buildWoohooPayload = (order, giftCard, companyConfig) => {
    const refno = `S2S-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const companyFirst = companyConfig.name.split(' ')[0] || 'Shop2Save';
    const companyLast = companyConfig.name.split(' ').slice(1).join(' ') || 'Billing';

    return {
        address: {
            firstname: companyFirst,
            lastname: companyLast,
            email: companyConfig.email,
            telephone: companyConfig.mobile,
            address1: companyConfig.address1,
            address2: companyConfig.address2 || '',
            city: companyConfig.city,
            state: companyConfig.state,
            country: companyConfig.country,
            pincode: companyConfig.pincode
        },
        payments: [
            {
                code: 'disbursement',
                amount: parseFloat(order.amount)
            }
        ],
        refno,
        syncOnly: false,
        deliveryMode: 'API',
        products: [
            {
                sku: giftCard.sku,
                qty: 1,
                price: parseFloat(order.amount),
                recipient: {
                    name: order.recipient_name,
                    email: order.recipient_email,
                    telephone: order.recipient_mobile,
                    message: order.gift_message || ''
                }
            }
        ]
    };
};
