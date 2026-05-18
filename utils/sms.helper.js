import twilio from 'twilio';
import logger from './logger.js';

// Retrieve credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

// Check if valid Twilio keys are configured
const isTwilioConfigured = 
    accountSid && 
    authToken && 
    fromNumber && 
    !accountSid.startsWith('ACXXXXXX') && 
    accountSid.trim() !== '';

let client = null;

if (isTwilioConfigured) {
    try {
        client = twilio(accountSid, authToken);
        logger.info(`Twilio client initialized successfully with SID: ${accountSid}`);
    } catch (error) {
        logger.error('Twilio client initialization failed', { error: error.message });
    }
} else {
    logger.info('Twilio credentials missing or placeholder. Running in DUMMY fallback mode.');
}

/**
 * Send an SMS message using Twilio (Falls back to Console log if unconfigured or fails)
 * @param {string} to - Recipient phone number (e.g. +919876543210)
 * @param {string} message - Message body content
 * @returns {Promise<{success: boolean, messageId?: string, isDummy: boolean, error?: string}>}
 */
export const sendSMS = async (to, message) => {
    if (client) {
        try {
            const response = await client.messages.create({
                body: message,
                from: fromNumber,
                to: to
            });
            logger.info(`Sent Twilio SMS successfully to ${to}. SID: ${response.sid}`);
            return { success: true, messageId: response.sid, isDummy: false };
        } catch (error) {
            logger.error(`Failed to send Twilio SMS to ${to}`, { error: error.message });
            // Fall back to dummy execution so developer remains unblocked!
            logger.info(`[Twilio SMS FALLBACK] Dummy Mode active. Message meant for ${to}: "${message}"`);
            return { success: true, isDummy: true, error: error.message };
        }
    } else {
        // Pure dummy mode (No twilio credentials configured)
        logger.info(`📱 [DUMMY SMS SENDER] To: ${to} | Message: ${message}`);
        return { success: true, isDummy: true };
    }
};
