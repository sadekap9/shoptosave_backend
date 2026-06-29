import axios from 'axios';
import { executeQuery } from '../../config/dbConfig.js';
import { getWoohooHeaders } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';

/**
 * Service to handle Woohoo API Authentication (OAuth 2.0)
 */

const fetchNewWoohooToken = async () => {
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
};

export const refreshWoohooToken = async () => {
    try {
        logger.info('[Woohoo Auth] Force-refreshing Woohoo Bearer Token.');
        const freshToken = await fetchNewWoohooToken();
        const expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await executeQuery(
            `INSERT INTO app_config (config_key, config_value, description)
             VALUES ('woohoo_access_token', ?, 'Woohoo OAuth2 Access Token')
             ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
            [freshToken]
        );
        await executeQuery(
            `INSERT INTO app_config (config_key, config_value, description)
             VALUES ('woohoo_token_expires_at', ?, 'Woohoo OAuth2 Access Token Expiry Time')
             ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
            [expiryTime]
        );

        logger.info('[Woohoo Auth] Woohoo Bearer Token refreshed successfully.');
        return freshToken;
    } catch (error) {
        logger.error('[Woohoo Auth] Failed to refresh Woohoo Bearer Token', { error: error.message });
        throw error;
    }
};

export const getWoohooToken = async () => {
    try {
        // 1. Read from app_config table
        const cachedRows = await executeQuery(
            `SELECT config_key, config_value FROM app_config 
             WHERE config_key IN ('woohoo_access_token', 'woohoo_token_expires_at')`
        );

        const tokenRow = cachedRows.find(r => r.config_key === 'woohoo_access_token');
        const expiresRow = cachedRows.find(r => r.config_key === 'woohoo_token_expires_at');

        if (tokenRow && expiresRow) {
            const token = tokenRow.config_value;
            const expiresAt = new Date(expiresRow.config_value);
            // If token exists and is not expired (expiry time > now)
            if (token && expiresAt.getTime() > Date.now()) {
                logger.info('[Woohoo Auth] Returning cached Bearer token from DB.');
                return token;
            }
        }

        // 2. Token not found or expired -> Fetch fresh token
        logger.info('[Woohoo Auth] Cached token missing or expired. Fetching fresh token.');
        return await refreshWoohooToken();
    } catch (error) {
        logger.error('Woohoo Authentication Failed', { error: error.message });
        throw new Error(`Failed to authenticate with Woohoo: ${error.message}`);
    }
};
