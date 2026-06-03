import axios from 'axios';
import { getWoohooHeaders } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';

/**
 * Service to handle Woohoo API Authentication (OAuth 2.0)
 */

export const getWoohooToken = async () => {
    try {
        const { 
            WOOHOO_AUTH_URL, 
            WOOHOO_TOKEN_URL, 
            WOOHOO_CLIENT_ID, 
            WOOHOO_CLIENT_SECRET, 
            WOOHOO_USERNAME, 
            WOOHOO_PASSWORD 
        } = process.env;

        // Step 1: Generate Authorization Code
        const authPayload = {
            clientId: WOOHOO_CLIENT_ID,
            username: WOOHOO_USERNAME,
            password: WOOHOO_PASSWORD
        };

        const authHeaders = getWoohooHeaders('POST', WOOHOO_AUTH_URL, authPayload);
        
        const authRes = await axios.post(WOOHOO_AUTH_URL, authPayload, { headers: authHeaders });
        const { authorizationCode } = authRes.data;

        // Step 2: Generate Bearer Token
        const tokenPayload = {
            authorizationCode,
            clientId: WOOHOO_CLIENT_ID,
            clientSecret: WOOHOO_CLIENT_SECRET
        };

        const tokenRes = await axios.post(WOOHOO_TOKEN_URL, tokenPayload);
        
        return tokenRes.data.token; // This is the Bearer Token
    } catch (error) {
        logger.error('Woohoo Authentication Failed', { error: error.response?.data || error.message });
        throw new Error('Failed to authenticate with Woohoo');
    }
};
