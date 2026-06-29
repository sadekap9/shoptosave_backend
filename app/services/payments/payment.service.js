import {
    getOrCreateWallet,
    debitWallet,
    creditWallet,
    generatePaymentTxnNo
} from '../wallets/wallets.service.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';
import {
    PAYMENT_METHOD,
    PAYMENT_TYPE,
    PAYMENT_TRANSACTION_STATUS,
    WALLET_TRANSACTION_SOURCE,
    GIFT_CARD_ORDER_PAYMENT_TYPE
} from '../../config/constant/constant.js';

/**
 * Create a payment_transactions record for online payments.
 * @param {number} userId
 * @param {number|null} orderId
 * @param {number} amount
 * @param {number} paymentMethod - PAYMENT_METHOD value (1=UPI, 2=Card, 3=NetBanking)
 * @param {number} paymentType - PAYMENT_TYPE value (1=Wallet Topup, 2=Order Payment)
 * @param {object} connection - DB connection (inside transaction)
 * @returns {{ paymentTxnNo, gatewayTxnId }}
 */
export const createPaymentTransaction = async (userId, orderId, amount, paymentMethod, paymentType, connection) => {
    const payTxnNo = await generatePaymentTxnNo(connection);
    const gatewayTxnId = `DUMMY_${crypto.randomUUID()}`;

    await connection.query(
        `INSERT INTO payment_transactions 
         (transaction_no, user_id, order_id, payment_method, payment_type, amount, gateway_transaction_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payTxnNo,
            userId,
            orderId || null,
            paymentMethod,
            paymentType,
            parseFloat(amount),
            gatewayTxnId,
            PAYMENT_TRANSACTION_STATUS.SUCCESS
        ]
    );

    logger.info(`[Payment Service] Payment transaction created. TxnNo: ${payTxnNo}, Amount: ₹${amount}, Gateway: ${gatewayTxnId}`);

    return {
        paymentTxnNo: payTxnNo,
        gatewayTxnId
    };
};

/**
 * Coordinate payment debiting across payment channels.
 * Supports: 1=Wallet Only, 2=Online Only, 3=Split Payment
 * 
 * @param {number} userId
 * @param {number} amount - total order amount
 * @param {number} paymentType - GIFT_CARD_ORDER_PAYMENT_TYPE value
 * @param {number} orderId - order FK
 * @param {number} paymentMethod - PAYMENT_METHOD value for online portion
 * @param {object} connection - DB connection (inside transaction)
 * @returns {{ walletDeducted, onlineDeducted, walletTransactionId, paymentTxnNo }}
 */
export const deductPayment = async (userId, amount, paymentType, orderId, paymentMethod, connection) => {
    const totalAmount = parseFloat(amount);
    let walletDeducted = 0.00;
    let onlineDeducted = 0.00;
    let walletTransactionId = null;
    let walletTxnNo = null;
    let paymentTxnNo = null;

    logger.info(`[Payment Service] Processing payment. Type: ${paymentType}, Amount: ₹${totalAmount}, Order ID: ${orderId}`);

    if (paymentType === GIFT_CARD_ORDER_PAYMENT_TYPE.WALLET_ONLY) {
        // Full wallet deduction
        const debitRes = await debitWallet(
            userId,
            totalAmount,
            WALLET_TRANSACTION_SOURCE.GIFT_CARD_PURCHASE,
            orderId,
            `Debit for order #${orderId}`,
            connection
        );
        walletDeducted = totalAmount;
        walletTransactionId = debitRes.transactionId;
        walletTxnNo = debitRes.transactionNo;
        logger.info(`[Payment Service] Wallet debited ₹${walletDeducted}. TxnNo: ${walletTxnNo}`);

    } else if (paymentType === GIFT_CARD_ORDER_PAYMENT_TYPE.ONLINE_ONLY) {
        // Full online payment
        const payRes = await createPaymentTransaction(
            userId,
            orderId,
            totalAmount,
            paymentMethod || PAYMENT_METHOD.UPI,
            PAYMENT_TYPE.ORDER_PAYMENT,
            connection
        );
        onlineDeducted = totalAmount;
        paymentTxnNo = payRes.paymentTxnNo;
        logger.info(`[Payment Service] Online payment ₹${onlineDeducted}. PayTxn: ${paymentTxnNo}`);

    } else if (paymentType === GIFT_CARD_ORDER_PAYMENT_TYPE.SPLIT_PAYMENT) {
        // Split: use whatever wallet balance is available, rest online
        const wallet = await getOrCreateWallet(userId, connection);
        const walletBalance = parseFloat(wallet.balance);

        walletDeducted = Math.min(walletBalance, totalAmount);
        onlineDeducted = totalAmount - walletDeducted;

        if (walletDeducted > 0) {
            const debitRes = await debitWallet(
                userId,
                walletDeducted,
                WALLET_TRANSACTION_SOURCE.GIFT_CARD_PURCHASE,
                orderId,
                `Debit for order #${orderId} (split payment)`,
                connection
            );
            walletTransactionId = debitRes.transactionId;
            walletTxnNo = debitRes.transactionNo;
            logger.info(`[Payment Service] Split: Wallet debited ₹${walletDeducted}. TxnNo: ${walletTxnNo}`);
        }

        if (onlineDeducted > 0) {
            const payRes = await createPaymentTransaction(
                userId,
                orderId,
                onlineDeducted,
                paymentMethod || PAYMENT_METHOD.UPI,
                PAYMENT_TYPE.ORDER_PAYMENT,
                connection
            );
            paymentTxnNo = payRes.paymentTxnNo;
            logger.info(`[Payment Service] Split: Online payment ₹${onlineDeducted}. PayTxn: ${paymentTxnNo}`);
        }
    }

    return {
        success: true,
        walletDeducted,
        onlineDeducted,
        walletTransactionId,
        walletTxnNo,
        paymentTxnNo,
        status: 'SUCCESS'
    };
};

/**
 * Refund user's wallet in case of order failure (Compensating Transaction).
 * Credits wallet and logs a Credit wallet_transaction with source = Refund.
 * @param {number} userId
 * @param {number} walletDeducted - amount to refund
 * @param {number} orderId
 * @param {string} reason
 * @param {object} connection - DB connection (inside transaction)
 */
export const processRefund = async (userId, walletDeducted, orderId, reason, connection) => {
    if (walletDeducted <= 0) return;

    logger.info(`[Payment Service] Initiating wallet refund of ₹${walletDeducted} for Order ${orderId}. Reason: ${reason}`);

    const creditRes = await creditWallet(
        userId,
        walletDeducted,
        WALLET_TRANSACTION_SOURCE.REFUND,
        orderId,
        `Refund for failed order: ${reason}`,
        connection
    );

    logger.info(`[Payment Service] Refund processed successfully. TxnNo: ${creditRes.transactionNo}`);
    return creditRes.transactionId;
};
