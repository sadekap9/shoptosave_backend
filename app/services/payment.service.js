import { getOrCreateWallet, debitWallet, creditWallet } from './wallet.service.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Coordinate payment debiting across numeric payment channels (1=Wallet, 2=UPI, 3=Both)
 */
export const deductPayment = async (userId, amount, paymentMethod, orderId, referenceId, connection) => {
    const totalAmount = parseFloat(amount);
    let walletDeducted = 0.00;
    let upiDeducted = 0.00;
    let upiTxnId = null;
    let walletTransactionId = null;

    logger.info(`[Payment Service] Processing payment. Method: ${paymentMethod}, Amount: ₹${totalAmount}, Order ID: ${orderId}`);

    const methodInt = parseInt(paymentMethod);

    if (methodInt === 1 || methodInt === 3) {
        // Fetch wallet first to check available balance
        const wallet = await getOrCreateWallet(userId, connection);
        const currentBalance = parseFloat(wallet.available_balance);

        if (methodInt === 1) {
            if (currentBalance < totalAmount) {
                throw { message: 'Insufficient wallet balance', code: 'INSUFFICIENT_BALANCE', statusCode: 400 };
            }
            walletDeducted = totalAmount;
        } else { // both
            walletDeducted = Math.min(currentBalance, totalAmount);
            upiDeducted = totalAmount - walletDeducted;
        }

        if (walletDeducted > 0) {
            // Call debitWallet: category = 2 (GiftCardPurchase), referenceType = 1 (Order)
            const debitRes = await debitWallet(
                userId,
                walletDeducted,
                2, // category=2 (GiftCardPurchase)
                1, // reference_type=1 (Order)
                orderId, // reference_id (integer FK)
                `Debit for order #${orderId}`,
                connection
            );
            walletTransactionId = debitRes.transactionId;
            logger.info(`[Payment Service] Wallet debited with ₹${walletDeducted}. Transaction ID: ${walletTransactionId}`);
        }
    } else if (methodInt === 2) {
        upiDeducted = totalAmount;
    }

    if (upiDeducted > 0) {
        // Process dummy UPI payment (auto-success)
        upiTxnId = `UPI_DUMMY_${crypto.randomUUID()}`;
        logger.info(`[Payment Service] UPI payment success. Reference: ${upiTxnId}, Amount: ₹${upiDeducted}`);
    }

    return {
        success: true,
        walletDeducted,
        upiDeducted,
        upiTxnId,
        walletTransactionId,
        status: 'SUCCESS'
    };
};

/**
 * Refund user's wallet in case of order failure (Compensating Transaction)
 */
export const processRefund = async (userId, walletDeducted, orderId, reason, connection) => {
    if (walletDeducted <= 0) return;

    logger.info(`[Payment Service] Initiating wallet refund of ₹${walletDeducted} for Order ${orderId}. Reason: ${reason}`);

    // Call creditWallet: category = 3 (Refund), referenceType = 1 (Order)
    const creditRes = await creditWallet(
        userId,
        walletDeducted,
        3, // category=3 (Refund)
        1, // reference_type=1 (Order)
        orderId, // reference_id (integer FK)
        `Refund for failed order: ${reason}`,
        connection
    );

    logger.info(`[Payment Service] Refund processed successfully. Wallet credited. Transaction ID: ${creditRes.transactionId}`);
    return creditRes.transactionId;
};
