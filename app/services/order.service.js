import pool, { runInTransaction } from '../config/dbConfig.js';
import { getOrCreateWallet } from './wallet.service.js';
import { placeGiftCardOrder } from './giftcard.service.js';
import { deductPayment, processRefund } from './payment.service.js';
import logger from '../utils/logger.js';

/**
 * Generate a fresh and unique reference number for Woohoo order tracking
 */
const generateWoohooRefNo = (userId) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ORDER_${yyyy}${mm}${dd}_${userId}_${random}`;
};

/**
 * Get Order Details with Payment Breakdown by ID
 */
export const getOrderById = async (orderId) => {
    const [[order]] = await pool.query(
        'SELECT * FROM gift_card_orders WHERE id = ?',
        [orderId]
    );
    if (!order) {
        throw { message: 'Order not found', code: 'NOT_FOUND', statusCode: 404 };
    }
    return {
        success: true,
        data: order
    };
};

/**
 * Main sequence flow for placing a Gift Card order (atomic, all-or-nothing)
 */
export const placeGiftCardOrderFlow = async (userId, payload) => {
    const { 
        giftcard_id, 
        sku, 
        price, 
        qty, 
        payment_method, 
        reference_id,
        recipient_name,
        recipient_email,
        recipient_mobile,
        gift_message
    } = payload;

    const totalAmount = parseFloat(price) * parseInt(qty);

    logger.info(`[Order Flow] Initiating order. User: ${userId}, Reference: ${reference_id}, Total: ₹${totalAmount}`);

    // Map payment method string/number to integer code (1=Wallet, 2=UPI, 3=Both)
    let methodInt = parseInt(payment_method);
    if (isNaN(methodInt)) {
        if (payment_method === 'wallet') methodInt = 1;
        else if (payment_method === 'upi') methodInt = 2;
        else if (payment_method === 'both') methodInt = 3;
    }

    const validMethods = [1, 2, 3];
    if (!validMethods.includes(methodInt)) {
        throw { message: 'Invalid payment method', code: 'INVALID_PAYMENT_METHOD', statusCode: 400 };
    }

    // Pre-flight validation: Check wallet balance before calling external APIs
    if (methodInt === 1) {
        const wallet = await getOrCreateWallet(userId);
        if (parseFloat(wallet.available_balance) < totalAmount) {
            throw {
                message: `Insufficient wallet balance. Required: ₹${totalAmount.toFixed(2)}, Available: ₹${parseFloat(wallet.available_balance).toFixed(2)}`,
                code: 'INSUFFICIENT_BALANCE',
                statusCode: 400
            };
        }
    }

    // Retrieve user master details for self-purchase evaluation and fallback details
    const [[user]] = await pool.query('SELECT name, email, phone FROM user_master WHERE id = ?', [userId]);
    const finalRecipientName = recipient_name || user?.name || 'Customer';
    const finalRecipientEmail = recipient_email || user?.email || 'customer@example.com';
    const finalRecipientMobile = recipient_mobile || user?.phone || '+918884520003';

    const isSelfPurchase = (user && user.phone === finalRecipientMobile) ? 1 : 0;

    // Step 1: Create or resolve PENDING order in DB (Idempotent)
    let order;
    const [[existingOrder]] = await pool.query(
        'SELECT * FROM gift_card_orders WHERE reference_id = ?',
        [reference_id]
    );

    if (existingOrder) {
        logger.info(`[Order Flow] Order already exists. Reference: ${reference_id}, Status: ${existingOrder.status}`);
        if (existingOrder.status !== 1) { // 1 = Pending
            return {
                success: existingOrder.status === 3, // 3 = Success/Completed
                data: existingOrder
            };
        }
        order = existingOrder;
    } else {
        const woohooRefNo = generateWoohooRefNo(userId);
        const [insertResult] = await pool.query(
            `INSERT INTO gift_card_orders 
             (user_id, gift_card_id, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message, 
              woohoo_reference_no, status, sku, qty, payment_method, wallet_deducted, upi_deducted, reference_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0.00, 0.00, ?)`,
            [
                userId, 
                giftcard_id, 
                totalAmount, 
                isSelfPurchase, 
                finalRecipientName, 
                finalRecipientEmail, 
                finalRecipientMobile, 
                gift_message || null, 
                woohooRefNo, 
                sku, 
                qty, 
                methodInt, 
                reference_id
            ]
        );
        const [[newOrder]] = await pool.query(
            'SELECT * FROM gift_card_orders WHERE id = ?',
            [insertResult.insertId]
        );
        order = newOrder;
    }

    // Step 2: Invoke Woohoo API
    const woohooResult = await placeGiftCardOrder({
        sku,
        price,
        qty,
        amount: totalAmount,
        refno: order.woohoo_reference_no
    });

    if (!woohooResult.success) {
        // Woohoo Failure: Mark status FAILED (4), do NOT deduct payment
        await pool.query(
            "UPDATE gift_card_orders SET status = 4, failure_reason = ?, woohoo_response = ? WHERE id = ?",
            [woohooResult.error, JSON.stringify({ error: woohooResult.error }), order.id]
        );
        throw {
            message: `Woohoo provider order failed: ${woohooResult.error}`,
            code: 'WOOHOO_FAILED',
            statusCode: 424
        };
    }

    const woohooResponseData = woohooResult.data;

    // Step 3: Woohoo succeeded -> Deduct payments atomically inside database transaction
    let paymentResult;
    try {
        paymentResult = await runInTransaction(async (connection) => {
            // Lock order row
            const [[lockedOrder]] = await connection.query(
                'SELECT * FROM gift_card_orders WHERE id = ? FOR UPDATE',
                [order.id]
            );

            if (lockedOrder.status !== 1) { // 1 = Pending
                return { status: lockedOrder.status }; // Already processed
            }

            // Perform balance debit/UPI transaction logs
            const deductRes = await deductPayment(
                userId,
                totalAmount,
                methodInt,
                order.id,
                reference_id,
                connection
            );

            const cards = woohooResponseData.cards || [];
            const mainCard = cards[0] || {};

            // Update order status to Success (3)
            await connection.query(
                `UPDATE gift_card_orders 
                 SET status = 3, 
                     wallet_deducted = ?, 
                     upi_deducted = ?, 
                     wallet_transaction_id = ?,
                     woohoo_order_id = ?, 
                     gift_card_number = ?,
                     gift_card_pin = ?,
                     expiry_date = ?,
                     woohoo_response = ? 
                 WHERE id = ?`,
                [
                    deductRes.walletDeducted,
                    deductRes.upiDeducted,
                    deductRes.walletTransactionId || null,
                    woohooResponseData.orderId || null,
                    mainCard.cardNumber || null,
                    mainCard.pin || null,
                    mainCard.validity || null,
                    JSON.stringify(woohooResponseData),
                    order.id
                ]
            );

            return {
                status: 3,
                wallet_deducted: deductRes.walletDeducted,
                upi_deducted: deductRes.upiDeducted
            };
        });

        logger.info(`[Order Flow] Order #${order.id} completed successfully`);
        const [[finalOrder]] = await pool.query(
            'SELECT * FROM gift_card_orders WHERE id = ?',
            [order.id]
        );
        return {
            success: true,
            message: 'Order completed successfully',
            data: finalOrder
        };

    } catch (paymentError) {
        // Payment Failure after Woohoo Success
        logger.error(`[Order Flow] Payment processing failed after Woohoo API success: ${paymentError.message}`);
        
        try {
            await runInTransaction(async (connection) => {
                // Refund wallet if any partial deduction occurred
                if (methodInt === 1 || methodInt === 3) {
                    const [[orderToCheck]] = await connection.query(
                        'SELECT wallet_deducted FROM gift_card_orders WHERE id = ?',
                        [order.id]
                    );
                    const parsedWalletDeduction = parseFloat(orderToCheck?.wallet_deducted || 0);
                    if (parsedWalletDeduction > 0) {
                        await processRefund(userId, parsedWalletDeduction, order.id, 'Payment resolution failure', connection);
                    }
                }

                // Update order to FAILED (4)
                await connection.query(
                    `UPDATE gift_card_orders 
                     SET status = 4, 
                         failure_reason = ?,
                         woohoo_response = ? 
                     WHERE id = ?`,
                    [`Payment failed: ${paymentError.message}`, JSON.stringify({ error: `Payment failed: ${paymentError.message}` }), order.id]
                );
            });
        } catch (rollbackErr) {
            logger.error(`[Order Flow] CRITICAL: Rollback refund failed for Order ${order.id}`, { error: rollbackErr.message });
        }

        throw {
            message: `Payment failed: ${paymentError.message}`,
            code: 'PAYMENT_FAILED',
            statusCode: 400
        };
    }
};
