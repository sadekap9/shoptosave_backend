import axios from 'axios';
import { executeQuery } from '../../config/dbConfig.js';
import { getWoohooHeaders } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';

let activeRefreshPromise = null;

const fetchNewWoohoo2Token = async () => {
    const { 
        WOOHOO2_AUTH_URL, 
        WOOHOO2_TOKEN_URL, 
        WOOHOO2_CLIENT_ID, 
        WOOHOO2_CLIENT_SECRET, 
        WOOHOO2_USERNAME, 
        WOOHOO2_PASSWORD 
    } = process.env;

    // Step 1: Generate Authorization Code
    const authPayload = {
        clientId: WOOHOO2_CLIENT_ID,
        username: WOOHOO2_USERNAME,
        password: WOOHOO2_PASSWORD
    };

    const authHeaders = getWoohooHeaders('POST', WOOHOO2_AUTH_URL, authPayload, null, WOOHOO2_CLIENT_SECRET);
    
    const authRes = await axios.post(WOOHOO2_AUTH_URL, authPayload, { headers: authHeaders });
    const { authorizationCode } = authRes.data;

    // Step 2: Generate Bearer Token
    const tokenPayload = {
        authorizationCode,
        clientId: WOOHOO2_CLIENT_ID,
        clientSecret: WOOHOO2_CLIENT_SECRET
    };

    const tokenRes = await axios.post(WOOHOO2_TOKEN_URL, tokenPayload);
    
    logger.info('[Woohoo2 Auth] Raw Token Response: ' + JSON.stringify(tokenRes.data));

    const token = tokenRes.data.access_token || tokenRes.data.token;
    if (!token) {
        throw new Error(`Invalid token response structure. Expected access_token or token, got: ${JSON.stringify(tokenRes.data)}`);
    }

    let expiryTime;
    if (tokenRes.data.expires_in) {
        const expiresInSeconds = parseInt(tokenRes.data.expires_in, 10);
        expiryTime = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
        logger.info(`[Woohoo2 Auth] Using expires_in from response: ${expiresInSeconds} seconds (${expiryTime})`);
    } else if (tokenRes.data.expiresAt) {
        expiryTime = new Date(tokenRes.data.expiresAt).toISOString();
        logger.info(`[Woohoo2 Auth] Using expiresAt from response: ${expiryTime}`);
    } else if (tokenRes.data.expires_at) {
        expiryTime = new Date(tokenRes.data.expires_at).toISOString();
        logger.info(`[Woohoo2 Auth] Using expires_at from response: ${expiryTime}`);
    } else {
        expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        logger.warn(`[Woohoo2 Auth] No expiry field found in token response. Falling back to 7 days: ${expiryTime}`);
    }

    return { token, expiryTime };
};

export const refreshWoohoo2Token = async () => {
    try {
        logger.info('[Woohoo2 Auth] Force-refreshing Woohoo2 Bearer Token.');
        const { token, expiryTime } = await fetchNewWoohoo2Token();

        await executeQuery(
            `INSERT INTO app_config (config_key, config_value, description)
             VALUES ('woohoo2_access_token', ?, 'Woohoo2 OAuth2 Access Token')
             ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
            [token]
        );
        await executeQuery(
            `INSERT INTO app_config (config_key, config_value, description)
             VALUES ('woohoo2_token_expires_at', ?, 'Woohoo2 OAuth2 Access Token Expiry Time')
             ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
            [expiryTime]
        );

        logger.info('[Woohoo2 Auth] Woohoo2 Bearer Token refreshed successfully.');
        return token;
    } catch (error) {
        logger.error('[Woohoo2 Auth] Failed to refresh Woohoo2 Bearer Token', { error: error.message });
        throw error;
    }
};

export const getWoohoo2Token = async () => {
    try {
        // 1. Read from app_config table
        const cachedRows = await executeQuery(
            `SELECT config_key, config_value FROM app_config 
             WHERE config_key IN ('woohoo2_access_token', 'woohoo2_token_expires_at')`
        );

        const tokenRow = cachedRows.find(r => r.config_key === 'woohoo2_access_token');
        const expiresRow = cachedRows.find(r => r.config_key === 'woohoo2_token_expires_at');

        let token = tokenRow ? tokenRow.config_value : null;
        let expiresAtStr = expiresRow ? expiresRow.config_value : null;

        let needsRefresh = false;
        if (!token || !expiresAtStr) {
            needsRefresh = true;
            logger.info('[Woohoo2 Auth] Cached token or expiry missing.');
        } else {
            const expiresAt = new Date(expiresAtStr);
            const bufferTime = 5 * 60 * 1000; // 5-minute buffer
            if (expiresAt.getTime() - bufferTime <= Date.now()) {
                needsRefresh = true;
                logger.info(`[Woohoo2 Auth] Cached token is expired or close to expiring (expires at: ${expiresAtStr}).`);
            }
        }

        if (needsRefresh) {
            // Guard against concurrent refreshes
            if (!activeRefreshPromise) {
                logger.info('[Woohoo2 Auth] Initiating token refresh promise.');
                activeRefreshPromise = refreshWoohoo2Token().finally(() => {
                    activeRefreshPromise = null;
                });
            } else {
                logger.info('[Woohoo2 Auth] Awaiting existing token refresh promise.');
            }
            return await activeRefreshPromise;
        }

        logger.info('[Woohoo2 Auth] Returning cached Bearer token from DB.');
        return token;
    } catch (error) {
        logger.error('Woohoo2 Authentication Failed', { error: error.message });
        throw new Error(`Failed to authenticate with Woohoo2: ${error.message}`);
    }
};
