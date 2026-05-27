import crypto from 'crypto';
import logger from './logger.js';

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
export const getWoohooHeaders = (method, url, body = null, token = null) => {
    const dateAtClient = new Date().toISOString();
    const clientSecret = process.env.WOOHOO_CLIENT_SECRET;
    
    console.log(`\n[Woohoo API Call] ${method} ${url}`);
    console.log(`[Woohoo API Config] Using Client Secret:`, clientSecret);
    if (body) {
        console.log(`[Woohoo API Payload]:`, JSON.stringify(body));
    }
    
    const signature = generateSignature(method, url, body, clientSecret);

    const headers = {
        'Content-Type': 'application/json',
        'dateAtClient': dateAtClient,
        'signature': signature,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log(`[Woohoo API Headers]:`, headers);

    return headers;
};
