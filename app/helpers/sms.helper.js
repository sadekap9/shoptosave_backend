import axios from 'axios';
import logger from '../utils/logger.js';

// Retrieve credentials
const authKey = process.env.YOURBULKSMS_AUTHKEY?.trim();
const sender = (process.env.YOURBULKSMS_SENDER || 'ABCDEF').trim();
const route = (process.env.YOURBULKSMS_ROUTE || '2').trim();
const templateId = (process.env.YOURBULKSMS_TEMPLATE_ID || '1777178720432825843').trim();

// Check if YourBulkSMS is configured
const isSMSConfigured = 
    authKey && 
    authKey !== 'your_yourbulksms_authkey' && 
    authKey.trim() !== '';

if (isSMSConfigured) {
    const maskedKey = authKey ? `${authKey.substring(0, 4)}...${authKey.substring(authKey.length - 4)}` : 'null';
    logger.info(`YourBulkSMS service initialized successfully. Loaded Auth Key: ${maskedKey}`);
} else {
    logger.info('YourBulkSMS credentials missing or placeholder. Running in DUMMY fallback mode.');
}

/**
 * Send an SMS message using YourBulkSMS (Falls back to Console log if unconfigured or fails)
 * @param {string} to - Recipient phone number (e.g. +919876543210)
 * @param {string} message - Message body content
 * @returns {Promise<{success: boolean, messageId?: string, isDummy: boolean, error?: string}>}
 */
export const sendSMS = async (to, message) => {
    if (isSMSConfigured) {
        try {
            // Strip leading '+' for mobiles param (e.g. '919876543210')
            const cleanMobiles = to.replace('+', '');

            const response = await axios.get('http://control.yourbulksms.com/api/sendhttp.php', {
                params: {
                    authkey: authKey,
                    mobiles: cleanMobiles,
                    message: message,
                    sender: sender,
                    route: route,
                    country: '0',
                    DLT_TE_ID: templateId,
                    response: 'json'
                },
                timeout: 15000
            });

            const data = response.data;
            logger.info(`Sent YourBulkSMS successfully to ${to}. Response: ${JSON.stringify(data)}`);
            return { success: true, messageId: data.msgid || data.message || 'N/A', isDummy: false };
        } catch (error) {
            const errMsg = error.response?.data || error.message;
            logger.error(`Failed to send YourBulkSMS to ${to}`, { error: errMsg });
            logger.info(`[YourBulkSMS FALLBACK] Dummy Mode active. Message meant for ${to}: "${message}"`);
            return { success: true, isDummy: true, error: JSON.stringify(errMsg) };
        }
    } else {
        // Pure dummy mode (No credentials configured)
        logger.info(`📱 [DUMMY SMS SENDER] To: ${to} | Message: ${message}`);
        return { success: true, isDummy: true };
    }
};

