import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

// SMTP configuration from environment variables
const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const isEmailConfigured = 
    smtpHost && 
    smtpUser && 
    smtpPass && 
    smtpHost.trim() !== '' &&
    smtpUser.trim() !== '' &&
    smtpPass.trim() !== '';

let transporter = null;
if (isEmailConfigured) {
    transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // true for 465, false for other ports
        auth: {
            user: smtpUser,
            pass: smtpPass
        }
    });
    logger.info(`Email service initialized successfully for host ${smtpHost}`);
} else {
    logger.info('SMTP credentials missing or empty in .env. Running in DUMMY email fallback mode.');
}

/**
 * Send an Email OTP using nodemailer (Falls back to Console log if unconfigured or fails)
 * @param {string} to - Recipient email (e.g. user@example.com)
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<{success: boolean, isDummy: boolean, error?: string}>}
 */
export const sendEmailOTP = async (to, otp) => {
    const fromAddress = 'Shop2Save <info@shoptosave.in>';
    const subject = 'Shop2Save - Forgot PIN OTP';
    const textContent = `Your Shop2Save OTP is ${otp}.\n\nThis OTP is valid for 5 minutes. Do not share this OTP with anyone.`;

    if (isEmailConfigured && transporter) {
        try {
            await transporter.sendMail({
                from: fromAddress,
                to: to,
                subject: subject,
                text: textContent
            });
            logger.info(`Sent email OTP successfully to ${to}`);
            return { success: true, isDummy: false };
        } catch (error) {
            logger.error(`Failed to send email OTP to ${to}`, { error: error.message });
            logger.info(`[Email FALLBACK] Dummy Mode active. Email meant for ${to}: OTP is ${otp}`);
            return { success: true, isDummy: true, error: error.message };
        }
    } else {
        // Pure dummy mode (No credentials configured)
        logger.info(`📧 [DUMMY EMAIL SENDER] To: ${to} | Sender: ${fromAddress} | Subject: ${subject} | Content: ${textContent}`);
        return { success: true, isDummy: true };
    }
};
