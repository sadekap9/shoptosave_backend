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

/**
 * Send Order Completion Email to Customer
 * @param {object} params
 * @param {string} params.to - Customer / Recipient email address
 * @param {string} params.customerName - Recipient / Customer Name
 * @param {number|string} params.orderId - Order ID
 * @param {string} params.giftCardName - Name of the Gift Card
 * @param {Array<{cardNumber: string, cardPin: string, validity: string, amount: number, productName?: string}>} params.cards - Array of card details
 * @param {string} [params.tncLink] - Terms & conditions link
 * @param {string} [params.tncContent] - Terms & conditions text content
 * @returns {Promise<{success: boolean, isDummy: boolean, error?: string}>}
 */
export const sendOrderCompletionEmail = async ({ to, customerName, orderId, giftCardName, cards = [], tncLink, tncContent }) => {
    const fromAddress = 'Shop2Save <info@shoptosave.in>';
    const subject = `Shop2Save - Your Order #${orderId} has been completed!`;

    const disclaimerText = 'Issued by Qwikcilver for SCLP brands (Brand bifurcations can be provided by respective Program Manager)';

    // Construct text representation of cards
    const cardTextList = cards.map((c, idx) => {
        return `Card #${idx + 1}:
- Card Number: ${c.cardNumber || 'N/A'}
- Card PIN: ${c.cardPin || 'N/A'}
- Expiry: ${c.validity || 'N/A'}
- Amount: ₹${parseFloat(c.amount || 0).toFixed(2)}`;
    }).join('\n\n');

    const tncText = tncContent ? `\nTerms & Conditions:\n${tncContent}` : '';
    const tncLinkText = tncLink ? `\nTerms & Conditions Link: ${tncLink}` : '';

    const textContent = `Hello ${customerName || 'Customer'},\n\nYour order #${orderId} for ${giftCardName || 'Gift Card'} is completed!\n\nBelow are your card details:\n\n${cardTextList}\n${tncText}${tncLinkText}\n\nNote: ${disclaimerText}\n\nThank you for shopping with Shop2Save!`;

    // Construct HTML cards rows
    const cardHtmlRows = cards.map((c, idx) => `
        <tr style="border-bottom: 1px solid #e0e0e0;">
            <td style="padding: 12px; font-weight: bold;">Card #${idx + 1}</td>
            <td style="padding: 12px; font-family: monospace; font-size: 14px; background: #f8f9fa;">${c.cardNumber || 'N/A'}</td>
            <td style="padding: 12px; font-family: monospace; font-size: 14px; background: #f8f9fa;">${c.cardPin || 'N/A'}</td>
            <td style="padding: 12px;">${c.validity || 'N/A'}</td>
            <td style="padding: 12px; font-weight: bold; color: #2e7d32;">₹${parseFloat(c.amount || 0).toFixed(2)}</td>
        </tr>
    `).join('');

    const tncHtml = (tncContent || tncLink) ? `
        <div style="margin-top: 24px; padding: 16px; background-color: #f1f3f4; border-radius: 8px; font-size: 13px; color: #333;">
            <h4 style="margin-top: 0; margin-bottom: 8px; color: #1a73e8;">Terms & Conditions</h4>
            ${tncContent ? `<div style="margin-bottom: 8px; white-space: pre-line;">${tncContent}</div>` : ''}
            ${tncLink ? `<p style="margin: 0;"><a href="${tncLink}" target="_blank" style="color: #1a73e8; text-decoration: underline;">View Full Terms & Conditions</a></p>` : ''}
        </div>
    ` : '';

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #1a73e8; margin-top: 0;">Order Completed Successfully!</h2>
            <p>Hello <strong>${customerName || 'Customer'}</strong>,</p>
            <p>Your order <strong>#${orderId}</strong> for <strong>${giftCardName || 'Gift Card'}</strong> has been completed. Below are your card details:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px; text-align: left;">
                <thead>
                    <tr style="background-color: #1a73e8; color: #ffffff;">
                        <th style="padding: 12px;">#</th>
                        <th style="padding: 12px;">Card Number</th>
                        <th style="padding: 12px;">Card PIN</th>
                        <th style="padding: 12px;">Expiry</th>
                        <th style="padding: 12px;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${cardHtmlRows}
                </tbody>
            </table>

            ${tncHtml}

            <div style="margin-top: 24px; padding: 12px; border-left: 4px solid #f9a825; background-color: #fffde7; font-size: 12px; color: #555;">
                <strong>Important Notice:</strong> ${disclaimerText}
            </div>

            <p style="margin-top: 24px; font-size: 14px; color: #777;">Thank you for shopping with Shop2Save!</p>
        </div>
    `;

    if (isEmailConfigured && transporter) {
        try {
            await transporter.sendMail({
                from: fromAddress,
                to: to,
                subject: subject,
                text: textContent,
                html: htmlContent
            });
            logger.info(`Sent order completion email successfully to ${to} for Order #${orderId}`);
            return { success: true, isDummy: false };
        } catch (error) {
            logger.error(`Failed to send order completion email to ${to} for Order #${orderId}`, { error: error.message });
            logger.info(`[Email FALLBACK] Dummy Mode active. Email meant for ${to} for Order #${orderId}`);
            return { success: true, isDummy: true, error: error.message };
        }
    } else {
        logger.info(`📧 [DUMMY EMAIL SENDER] To: ${to} | Subject: ${subject} | Order #${orderId} completed with ${cards.length} card(s).`);
        return { success: true, isDummy: true };
    }
};

