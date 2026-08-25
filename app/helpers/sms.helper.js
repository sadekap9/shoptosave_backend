import axios from 'axios';
import logger from '../utils/logger.js';

// Retrieve credentials
const tokenId = process.env.BULKSMS_TOKEN_ID;
const tokenSecret = process.env.BULKSMS_TOKEN_SECRET;

// Check if BulkSMS is configured
const isBulkSMSConfigured = 
    tokenId && 
    tokenSecret && 
    tokenId !== 'your_bulksms_token_id' && 
    tokenId.trim() !== '';

if (isBulkSMSConfigured) {
    logger.info('BulkSMS service initialized successfully');
} else {
    logger.info('BulkSMS credentials missing or placeholder. Running in DUMMY fallback mode.');
}

/**
 * Send an SMS message using BulkSMS (Falls back to Console log if unconfigured or fails)
 * @param {string} to - Recipient phone number (e.g. +919876543210)
 * @param {string} message - Message body content
 * @returns {Promise<{success: boolean, messageId?: string, isDummy: boolean, error?: string}>}
 */
export const sendSMS = async (to, message) => {
    if (isBulkSMSConfigured) {
        try {
            const authHeader = 'Basic ' + Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64');
            const response = await axios.post(
                'https://api.bulksms.com/v1/messages',
                {
                    to: to,
                    body: message
                },
                {
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json'
                      },
                      timeout: 15000
                }
            );
            logger.info(`Sent BulkSMS successfully to ${to}. Message ID: ${response.data.id || 'N/A'}`);
            return { success: true, messageId: response.data.id, isDummy: false };
        } catch (error) {
            const errMsg = error.response?.data?.detail || error.message;
            logger.error(`Failed to send BulkSMS to ${to}`, { error: errMsg });
            // Fall back to dummy execution so developer remains unblocked!
            logger.info(`[BulkSMS FALLBACK] Dummy Mode active. Message meant for ${to}: "${message}"`);
            return { success: true, isDummy: true, error: errMsg };
        }
    } else {
        // Pure dummy mode (No credentials configured)
        logger.info(`📱 [DUMMY SMS SENDER] To: ${to} | Message: ${message}`);
        return { success: true, isDummy: true };
    }
};
