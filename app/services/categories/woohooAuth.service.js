import axios from 'axios';
import { executeQuery } from '../../config/dbConfig.js';
import { getWoohooHeaders } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';

/**
 * Service to handle Woohoo API Authentication (OAuth 2.0)
 */

let activeRefreshPromise = null;

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
    
    // Log raw token response once to confirm field names
    logger.info('[Woohoo Auth] Raw Token Response: ' + JSON.stringify(tokenRes.data));

    const token = tokenRes.data.access_token || tokenRes.data.token;
    if (!token) {
        throw new Error(`Invalid token response structure. Expected access_token or token, got: ${JSON.stringify(tokenRes.data)}`);
    }

    let expiryTime;
    if (tokenRes.data.expires_in) {
        const expiresInSeconds = parseInt(tokenRes.data.expires_in, 10);
        expiryTime = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
        logger.info(`[Woohoo Auth] Using expires_in from response: ${expiresInSeconds} seconds (${expiryTime})`);
    } else if (tokenRes.data.expiresAt) {
        expiryTime = new Date(tokenRes.data.expiresAt).toISOString();
        logger.info(`[Woohoo Auth] Using expiresAt from response: ${expiryTime}`);
    } else if (tokenRes.data.expires_at) {
        expiryTime = new Date(tokenRes.data.expires_at).toISOString();
        logger.info(`[Woohoo Auth] Using expires_at from response: ${expiryTime}`);
    } else {
        expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        logger.warn(`[Woohoo Auth] No expiry field found in token response. Falling back to 7 days: ${expiryTime}`);
    }

    return { token, expiryTime };
};

export const refreshWoohooToken = async () => {
    try {
        logger.info('[Woohoo Auth] Force-refreshing Woohoo Bearer Token.');
        const { token, expiryTime } = await fetchNewWoohooToken();

        await executeQuery(
            `INSERT INTO app_config (config_key, config_value, description)
             VALUES ('woohoo_access_token', ?, 'Woohoo OAuth2 Access Token')
             ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
            [token]
        );
        await executeQuery(
            `INSERT INTO app_config (config_key, config_value, description)
             VALUES ('woohoo_token_expires_at', ?, 'Woohoo OAuth2 Access Token Expiry Time')
             ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
            [expiryTime]
        );

        logger.info('[Woohoo Auth] Woohoo Bearer Token refreshed successfully.');
        return token;
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

        let token = tokenRow ? tokenRow.config_value : null;
        let expiresAtStr = expiresRow ? expiresRow.config_value : null;

        let needsRefresh = false;
        if (!token || !expiresAtStr) {
            needsRefresh = true;
            logger.info('[Woohoo Auth] Cached token or expiry missing.');
        } else {
            const expiresAt = new Date(expiresAtStr);
            const bufferTime = 5 * 60 * 1000; // 5-minute buffer
            if (expiresAt.getTime() - bufferTime <= Date.now()) {
                needsRefresh = true;
                logger.info(`[Woohoo Auth] Cached token is expired or close to expiring (expires at: ${expiresAtStr}).`);
            }
        }

        if (needsRefresh) {
            // Guard against concurrent refreshes
            if (!activeRefreshPromise) {
                logger.info('[Woohoo Auth] Initiating token refresh promise.');
                activeRefreshPromise = refreshWoohooToken().finally(() => {
                    activeRefreshPromise = null;
                });
            } else {
                logger.info('[Woohoo Auth] Awaiting existing token refresh promise.');
            }
            return await activeRefreshPromise;
        }

        logger.info('[Woohoo Auth] Returning cached Bearer token from DB.');
        return token;
    } catch (error) {
        logger.error('Woohoo Authentication Failed', { error: error.message });
        throw new Error(`Failed to authenticate with Woohoo: ${error.message}`);
    }
};
