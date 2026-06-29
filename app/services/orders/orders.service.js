import pool, { runInTransaction } from '../../config/dbConfig.js';
import { getWoohooToken } from '../categories/woohooAuth.service.js';
import { placeWoohooOrder } from '../woohoo/woohoo.service.js';
import { getOrCreateWallet } from '../wallets/wallets.service.js';
import { companyConfig } from '../../config/companyConfig.js';
import { buildWoohooPayload } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';
import { placeGiftCardOrder } from '../giftCards/giftCards.service.js';
import { deductPayment, processRefund } from '../payment.service.js';

/**
 * Fetch Company details from app_config table, fallback to file config
 */
async function getCompanyDetails() {
    try {
        const [[nameRow]] = await pool.query("SELECT config_value FROM app_config WHERE config_key = 'company_name';");
        const [[emailRow]] = await pool.query("SELECT config_value FROM app_config WHERE config_key = 'company_email';");
        const [[mobileRow]] = await pool.query("SELECT config_value FROM app_config WHERE config_key = 'company_mobile';");
        const [[addressRow]] = await pool.query("SELECT config_value FROM app_config WHERE config_key = 'company_address';");
        
        return {
            name: nameRow?.config_value || companyConfig.name,
            email: emailRow?.config_value || companyConfig.email,
            mobile: mobileRow?.config_value || companyConfig.mobile,
            address1: addressRow?.config_value || companyConfig.address1,
            address2: companyConfig.address2,
            city: companyConfig.city,
            state: companyConfig.state,
            country: companyConfig.country,
            pincode: companyConfig.pincode,
            gst: companyConfig.gst
        };
    } catch (err) {
        logger.warn('Failed to fetch company details from app_config. Using companyConfig fallback.', { error: err.message });
        return companyConfig;
    }
}

/**
 * Refund user's wallet in case of order failure (Compensating Transaction)
 */
async function refundOrder(userId, walletId, orderId, amount, reason) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        // Lock Wallet row
        const [[wallet]] = await connection.query('SELECT available_balance FROM wallets WHERE id = ? FOR UPDATE', [walletId]);
        if (!wallet) throw new Error('Wallet not found during refund');

        const openingBalance = parseFloat(wallet.available_balance);
        const closingBalance = openingBalance + parseFloat(amount);

        // 1. Credit wallet
        await connection.query(
            `UPDATE wallets 
             SET available_balance = available_balance + ?, 
                 total_credited = total_credited + ? 
             WHERE id = ?`,
            [amount, amount, walletId]
        );

        // 2. Insert Credit Transaction Ledger
        const refundTxnNo = `TXN-REF-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        await connection.query(
            `INSERT INTO wallet_transactions 
             (wallet_id, transaction_no, type, category, amount, opening_balance, closing_balance, reference_type, reference_id, status, remarks)
             VALUES (?, ?, 1, 0, ?, ?, ?, 1, ?, 1, ?)`, // category = 0 (Refund), reference_type = 1 (Order)
            [walletId, refundTxnNo, amount, openingBalance, closingBalance, orderId, `Refund for failed order: ${reason}`]
        );

        // 3. Mark order as FAILED (status = 4)
        await connection.query(
            `UPDATE gift_card_orders 
             SET status = 4, failure_reason = ? 
             WHERE id = ?`,
            [reason, orderId]
        );

        await connection.commit();
        logger.info(`[Refund System] Refund processed successfully for user ${userId}, order ${orderId}. Reason: ${reason}`);
    } catch (err) {
        await connection.rollback();
        logger.error(`[Refund System] CRITICAL: Refund failed for user ${userId}, order ${orderId}`, { error: err.message });
    } finally {
        connection.release();
    }
}

/**
 * Place a gift card order
 * Encapsulates full business security flow:
 * 1. Validate JWT (handled by middleware)
 * 2. Validate Gift Card details
 * 3. Validate denomination limits
 * 4. Ensure wallet exists & check balance
 * 5. Deduct balance + create local order in database transaction using SELECT FOR UPDATE row-locks
 * 6. Commit transaction before third-party calls
 * 7. Call Woohoo using company address and customer recipient details
 * 8. Handle Success (card details + status complete) or Failure (refund rollback transaction)
 */
export const placeOrderService = async (userId, orderData) => {
    const { gift_card_id, amount, recipient_name, recipient_email, recipient_mobile, gift_message } = orderData;
    const totalAmount = parseFloat(amount);

    // 1. Resolve local user details
    const [[user]] = await pool.query('SELECT name, email, phone FROM user_master WHERE id = ?', [userId]);
    if (!user) {
        return {
            success: false,
            statusCode: 404,
            message: 'User account not found'
        };
    }

    // Determine if self purchase (if recipient mobile matches user phone)
    const isSelfPurchase = (user.phone && recipient_mobile === user.phone) ? 1 : 0;

    // 2. Validate Gift Card exists and is active (Step 2)
    const [[giftCard]] = await pool.query('SELECT * FROM gift_cards WHERE id = ? AND status = 1', [gift_card_id]);
    if (!giftCard) {
        return {
            success: false,
            statusCode: 400,
            message: 'Gift card is inactive or does not exist'
        };
    }

    // 3. Validate denomination range (Step 3)
    const minDenom = parseFloat(giftCard.min_denomination) || 0;
    const maxDenom = parseFloat(giftCard.max_denomination) || 9999999;
    if (totalAmount < minDenom || totalAmount > maxDenom) {
        return {
            success: false,
            statusCode: 400,
            message: `Amount ₹${totalAmount.toFixed(2)} must be between ₹${minDenom.toFixed(2)} and ₹${maxDenom.toFixed(2)}`
        };
    }

    // 4. Ensure wallet exists (checks / creates on-the-fly, Step 4)
    const wallet = await getOrCreateWallet(userId);

    // 5. Check wallet balance (Step 5)
    const currentBalance = parseFloat(wallet.available_balance) || 0.00;
    if (currentBalance < totalAmount) {
        return {
            success: false,
            statusCode: 400,
            message: `Insufficient Wallet Balance. Required: ₹${totalAmount.toFixed(2)}, Available: ₹${currentBalance.toFixed(2)}`
        };
    }

    // 6. Fetch Company billing configuration details and generate payload
    const company = await getCompanyDetails();
    const orderPayload = buildWoohooPayload(
        {
            amount: totalAmount,
            recipient_name,
            recipient_email,
            recipient_mobile,
            gift_message
        },
        giftCard,
        company
    );
    const refno = orderPayload.refno;
    const txnNo = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    let orderId;
    let txnId;

    try {
        // 7. Lock Wallet using SELECT FOR UPDATE (Step 7)
        const [[lockedWallet]] = await connection.query(
            'SELECT id, available_balance, total_debited FROM wallets WHERE id = ? FOR UPDATE',
            [wallet.id]
        );

        const activeBalance = parseFloat(lockedWallet.available_balance);
        if (activeBalance < totalAmount) {
            await connection.rollback();
            return {
                success: false,
                statusCode: 400,
                message: 'Insufficient Wallet Balance'
            };
        }

        const openingBalance = activeBalance;
        const closingBalance = activeBalance - totalAmount;

        // 8. Debit Wallet (Step 8)
        await connection.query(
            `UPDATE wallets 
             SET available_balance = available_balance - ?, 
                 total_debited = total_debited + ? 
             WHERE id = ?`,
            [totalAmount, totalAmount, wallet.id]
        );

        // 9. Insert wallet_transactions debit log (Step 9)
        const [txnResult] = await connection.query(
            `INSERT INTO wallet_transactions 
             (wallet_id, transaction_no, type, category, amount, opening_balance, closing_balance, reference_type, status, remarks)
             VALUES (?, ?, 0, 0, ?, ?, ?, 1, 1, ?)`, // type = 0 (Debit), category = 0 (Woohoo purchase), status = 1 (Success)
            [wallet.id, txnNo, totalAmount, openingBalance, closingBalance, `Debit for ${giftCard.gift_card_name} purchase`]
        );
        txnId = txnResult.insertId;

        // 10. Insert gift_card_orders with Status = Pending (0) (Step 10)
        const [orderResult] = await connection.query(
            `INSERT INTO gift_card_orders 
             (user_id, gift_card_id, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message, wallet_transaction_id, woohoo_reference_no, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [userId, giftCard.id, totalAmount, isSelfPurchase, recipient_name, recipient_email, recipient_mobile, gift_message || null, txnId, refno]
        );
        orderId = orderResult.insertId;

        // Update reference_id in transaction log
        await connection.query('UPDATE wallet_transactions SET reference_id = ? WHERE id = ?', [orderId, txnId]);

        // 11. Commit Transaction before external calls (Step 11)
        await connection.commit();
        logger.info(`[Order System] Local transaction committed. Wallet debited. Order ID: ${orderId}`);

    } catch (dbErr) {
        await connection.rollback();
        logger.error('[Order System] Transaction rollback due to database error', { error: dbErr.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Database transaction error during order placement'
        };
    } finally {
        connection.release();
    }

    // 12. Retrieve Woohoo Bearer Token (Step 12 uses refno generated above)
    let bearerToken;
    try {
        bearerToken = await getWoohooToken();
    } catch (authErr) {
        logger.error('[Order System] Woohoo authentication failed. Refunding wallet.', { error: authErr.message });
        await refundOrder(userId, wallet.id, orderId, totalAmount, 'Woohoo OAuth token failed');
        return {
            success: false,
            statusCode: 500,
            message: 'Provider authentication failed. Wallet has been refunded.'
        };
    }

    // 14. Place Order via Woohoo API (Step 14)
    try {
        const woohooResponse = await placeWoohooOrder(bearerToken, orderPayload);
        const statusStr = woohooResponse.status?.toLowerCase();

        let dbOrderStatus = 1; // 1 = PROCESSING
        if (statusStr === 'complete' || statusStr === 'success') {
            dbOrderStatus = 2; // 2 = COMPLETE (Success)
        } else if (statusStr === 'failed' || statusStr === 'cancelled') {
            dbOrderStatus = 4; // 4 = FAILED
        }

        if (dbOrderStatus === 4) {
            logger.error('[Order System] Woohoo order rejected status. Refunding wallet.', { status: statusStr, message: woohooResponse.message });
            await refundOrder(userId, wallet.id, orderId, totalAmount, woohooResponse.message || 'Woohoo rejected order');
            return {
                success: false,
                statusCode: 400,
                message: `Order rejected by provider: ${woohooResponse.message || 'Unknown error'}. Wallet has been refunded.`,
                result: woohooResponse
            };
        }

        // 15. Woohoo Success (Step 15)
        const cards = woohooResponse.cards || [];
        const mainCard = cards[0] || {}; // Quantity is 1

        await pool.query(
            `UPDATE gift_card_orders 
             SET status = 2, 
                 woohoo_order_id = ?, 
                 gift_card_number = ?, 
                 gift_card_pin = ?, 
                 expiry_date = ? 
             WHERE id = ?`,
            [
                woohooResponse.orderId || null, 
                mainCard.cardNumber || null, 
                mainCard.pin || null, 
                mainCard.validity || null, 
                orderId
            ]
        );

        return {
            success: true,
            statusCode: 200,
            message: 'Order completed successfully',
            data: {
                orderId,
                woohooOrderId: woohooResponse.orderId,
                status: 'SUCCESS',
                gift_card_number: mainCard.cardNumber,
                gift_card_pin: mainCard.pin,
                expiry_date: mainCard.validity
            }
        };

    } catch (apiErr) {
        // 16. Woohoo Failure (Step 16)
        const apiErrorMsg = apiErr.response?.data?.message || apiErr.message;
        logger.error('[Order System] Exception during Woohoo order request. Refunding wallet.', { error: apiErrorMsg });
        await refundOrder(userId, wallet.id, orderId, totalAmount, `Woohoo error: ${apiErrorMsg}`);
        return {
            success: false,
            statusCode: 500,
            message: `Provider order request failed: ${apiErrorMsg}. Wallet has been refunded.`
        };
    }
};

/**
 * Step 12: Order History
 */
export const getOrderHistoryService = async (userId) => {
    const [orders] = await pool.query(
        `SELECT gco.id, gc.brand_name, gco.amount, gco.status, gco.created_at, gco.gift_card_number, gco.expiry_date
         FROM gift_card_orders gco
         JOIN gift_cards gc ON gco.gift_card_id = gc.id
         WHERE gco.user_id = ?
         ORDER BY gco.id DESC`,
        [userId]
    );
    return {
        success: true,
        statusCode: 200,
        message: 'Order history fetched successfully',
        data: orders
    };
};

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
