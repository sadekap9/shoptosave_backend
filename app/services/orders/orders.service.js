import pool, { runInTransaction } from '../../config/dbConfig.js';
import { getWoohooToken } from '../categories/woohooAuth.service.js';
import { placeWoohooOrder, getWoohooOrderByRefNo } from '../woohoo/woohoo.service.js';
import { creditWallet } from '../wallets/wallets.service.js';
import { buildWoohooPayload } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';
import { placeGiftCardOrder } from '../giftCards/giftCards.service.js';
import { deductPayment } from '../payments/payment.service.js';
import {
    WALLET_TRANSACTION_SOURCE,
    PAYMENT_METHOD,
    GIFT_CARD_ORDER_PAYMENT_TYPE
} from '../../config/constant/constant.js';
import { validateOfferForOrder } from '../offers/offers.service.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { processConditionalOrderActivation } from '../activation/activation.service.js';

/**
 * Fetch Company details from app_config table, fallback to file config
 */
async function getCompanyDetails() {
    try {
        const [rows] = await pool.query(
            "SELECT config_key, config_value FROM app_config WHERE config_key IN ('company_name', 'company_email', 'company_mobile', 'company_address');"
        );
        const configMap = rows.reduce((acc, row) => {
            acc[row.config_key] = row.config_value;
            return acc;
        }, {});

        return {
            name: configMap.company_name || companyConfig.name,
            email: configMap.company_email || companyConfig.email,
            mobile: configMap.company_mobile || companyConfig.mobile,
            address1: configMap.company_address || companyConfig.address1,
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
 * Generate a fresh and unique reference number for Woohoo order tracking
 */
const generateWoohooRefNo = (userId) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `NEWTRONE_${yyyy}${mm}${dd}_${userId}_${random}`;
};

// ─── Place Order (Legacy — Wallet Only) ────────────────────────────────────────

/**
 * Place a gift card order (Legacy flow — Wallet Only payment).
 * Steps:
 * 1. Validate gift card and denomination
 * 2. Lock user_wallet FOR UPDATE, check balance
 * 3. Debit wallet + insert wallet_transaction
 * 4. Insert gift_card_orders with payment_type=Wallet
 * 5. COMMIT before calling Woohoo API
 * 6. Call Woohoo API
 * 7. On success → update order status to COMPLETE; on failure → refund wallet
 */
export const placeOrderService = async (userId, orderData) => {
    const { gift_card_id, amount, recipient_name, recipient_email, recipient_mobile, gift_message } = orderData;
    const totalAmount = parseFloat(amount);

    // 1. Resolve local user details
    const [[user]] = await pool.query('SELECT name, email, phone FROM user_master WHERE id = ?', [userId]);
    if (!user) {
        return { success: false, statusCode: 404, message: 'User account not found' };
    }

    const isSelfPurchase = (user.phone && recipient_mobile === user.phone) ? 1 : 0;

    // 2. Validate Gift Card exists and is active
    const [[giftCard]] = await pool.query(
        `SELECT id, sku, gift_card_name, min_denomination, max_denomination
         FROM gift_cards WHERE id = ? AND status = 1`,
        [gift_card_id]
    );
    if (!giftCard) {
        return { success: false, statusCode: 400, message: 'Gift card is inactive or does not exist' };
    }

    // 3. Validate denomination range
    const minDenom = parseFloat(giftCard.min_denomination) || 0;
    const maxDenom = parseFloat(giftCard.max_denomination) || 9999999;
    if (totalAmount < minDenom || totalAmount > maxDenom) {
        return {
            success: false,
            statusCode: 400,
            message: `Amount ₹${totalAmount.toFixed(2)} must be between ₹${minDenom.toFixed(2)} and ₹${maxDenom.toFixed(2)}`
        };
    }

    // 4. Ensure wallet exists
    const wallet = await getOrCreateWallet(userId);

    // 5. Check wallet balance
    const currentBalance = parseFloat(wallet.balance) || 0.00;
    if (currentBalance < totalAmount) {
        return {
            success: false,
            statusCode: 400,
            message: `Insufficient Wallet Balance. Required: ₹${totalAmount.toFixed(2)}, Available: ₹${currentBalance.toFixed(2)}`
        };
    }

    // 6. Fetch Company billing configuration and generate Woohoo payload
    const company = await getCompanyDetails();
    const orderPayload = buildWoohooPayload(
        { amount: totalAmount, recipient_name, recipient_email, recipient_mobile, gift_message },
        giftCard,
        company
    );
    const refno = orderPayload.refno;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    let orderId;
    let walletTxnNo;

    try {
        // 7. Lock user_wallet using SELECT FOR UPDATE
        const [[lockedWallet]] = await connection.query(
            'SELECT id, balance FROM user_wallet WHERE id = ? FOR UPDATE',
            [wallet.id]
        );

        const activeBalance = parseFloat(lockedWallet.balance);
        if (activeBalance < totalAmount) {
            await connection.rollback();
            return { success: false, statusCode: 400, message: 'Insufficient Wallet Balance' };
        }

        const balanceBefore = activeBalance;
        const balanceAfter = activeBalance - totalAmount;

        // 8. Debit user_wallet
        await connection.query(
            'UPDATE user_wallet SET balance = balance - ? WHERE id = ?',
            [totalAmount, wallet.id]
        );

        // 9. Generate WT transaction number and insert wallet_transactions debit log
        walletTxnNo = await generateWalletTxnNo(connection);
        const [txnResult] = await connection.query(
            `INSERT INTO wallet_transactions 
             (transaction_no, wallet_id, user_id, order_id, type, source, amount, balance_before, balance_after, remarks, status)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
            [
                walletTxnNo,
                wallet.id,
                userId,
                WALLET_TRANSACTION_TYPE.DEBIT,
                WALLET_TRANSACTION_SOURCE.GIFT_CARD_PURCHASE,
                totalAmount,
                balanceBefore,
                balanceAfter,
                `Debit for ${giftCard.gift_card_name} purchase`,
                WALLET_TRANSACTION_STATUS.SUCCESS
            ]
        );
        const txnId = txnResult.insertId;

        // 10. Insert gift_card_orders with status = Pending (0)
        const [orderResult] = await connection.query(
            `INSERT INTO gift_card_orders 
             (user_id, gift_card_id, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message, 
              wallet_transaction_id, woohoo_reference_no, status, wallet_amount, online_amount, payment_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0.00, ?)`,
            [
                userId, giftCard.id, totalAmount, isSelfPurchase,
                isSelfPurchase === 1 ? null : recipient_name,
                isSelfPurchase === 1 ? null : recipient_email,
                isSelfPurchase === 1 ? null : recipient_mobile,
                isSelfPurchase === 1 ? null : (gift_message || null),
                txnId, refno,
                totalAmount,
                GIFT_CARD_ORDER_PAYMENT_TYPE.WALLET_ONLY
            ]
        );
        orderId = orderResult.insertId;

        // Update order_id in wallet_transactions
        await connection.query('UPDATE wallet_transactions SET order_id = ? WHERE id = ?', [orderId, txnId]);

        // 11. Commit before external calls
        await connection.commit();
        logger.info(`[Order System] Local transaction committed. Wallet debited. Order ID: ${orderId}`);

    } catch (dbErr) {
        await connection.rollback();
        logger.error('[Order System] Transaction rollback due to database error', { error: dbErr.message });
        return { success: false, statusCode: 500, message: 'Database transaction error during order placement' };
    } finally {
        connection.release();
    }

    // 12. Call Woohoo API
    let bearerToken;
    try {
        bearerToken = await getWoohooToken();
    } catch (authErr) {
        logger.error('[Order System] Woohoo authentication failed. Refunding wallet.', { error: authErr.message });
        await runInTransaction(async (conn) => {
            await creditWallet(userId, totalAmount, WALLET_TRANSACTION_SOURCE.REFUND, orderId, 'Woohoo OAuth token failed', conn);
            await conn.query('UPDATE gift_card_orders SET status = 4, failure_reason = ? WHERE id = ?', ['Woohoo OAuth token failed', orderId]);
        });
        return { success: false, statusCode: 500, message: 'Provider authentication failed. Wallet has been refunded.' };
    }

    try {
        const woohooResponse = await placeWoohooOrder(bearerToken, orderPayload);
        const statusStr = woohooResponse.status?.toLowerCase();

        let dbOrderStatus = 1; // PROCESSING
        if (statusStr === 'complete' || statusStr === 'success') {
            dbOrderStatus = 2; // COMPLETE
        } else if (statusStr === 'failed' || statusStr === 'cancelled') {
            dbOrderStatus = 4; // FAILED
        }

        if (dbOrderStatus === 4) {
            logger.error('[Order System] Woohoo order rejected. Refunding wallet.', { status: statusStr });
            await runInTransaction(async (conn) => {
                await creditWallet(userId, totalAmount, WALLET_TRANSACTION_SOURCE.REFUND, orderId, woohooResponse.message || 'Woohoo rejected order', conn);
                await conn.query('UPDATE gift_card_orders SET status = 4, failure_reason = ? WHERE id = ?', [woohooResponse.message || 'Woohoo rejected order', orderId]);
            });
            return {
                success: false,
                statusCode: 400,
                message: `Order rejected by provider: ${woohooResponse.message || 'Unknown error'}. Wallet has been refunded.`,
                result: woohooResponse
            };
        }

        // Woohoo Success
        const cards = woohooResponse.cards || [];
        const mainCard = cards[0] || {};

        await runInTransaction(async (conn) => {
            await conn.query(
                `UPDATE gift_card_orders 
                 SET status = 2, 
                     woohoo_order_id = ? 
                 WHERE id = ?`,
                [woohooResponse.orderId || null, orderId]
            );

            if (cards.length > 0) {
                const itemValues = cards.map(c => [
                    orderId,
                    c.cardId || c.card_id || c.id || null,
                    c.sku || null,
                    c.productName || c.product_name || c.name || null,
                    encrypt(c.cardNumber || c.card_number || c.cardNo || c.number || c.card_no || ""),
                    encrypt(c.cardPin || c.card_pin || c.pin || c.activationCode || c.activation_code || ""),
                    c.barcode || null,
                    c.amount || null,
                    c.validity || c.expiryDate || c.expiry_date || c.expiry || null,
                    c.issuanceDate || c.issuance_date || null,
                    c.cardView?.identifier || c.card_view?.identifier || null
                ]);
                await conn.query(
                    `INSERT INTO gift_card_order_items 
                     (order_id, woohoo_card_id, sku, product_name, card_number, card_pin, barcode, amount, validity, issuance_date, card_view_identifier) 
                     VALUES ?`,
                    [itemValues]
                );
            }
        });

        // Credit cashback if applicable
        const cashbackPct = parseFloat(giftCard.cashback_percentage) || 0;
        if (cashbackPct > 0) {
            try {
                await runInTransaction(async (conn) => {
                    await creditCashback(userId, orderId, totalAmount, cashbackPct, conn);
                });
            } catch (cbErr) {
                logger.error('[Order System] Cashback credit failed (non-critical)', { error: cbErr.message });
            }
        }

        // Trigger order completion email (non-blocking)
        sendOrderCompletionEmailByOrderId(orderId).catch(err => logger.error('[Order System] Email notification error:', err));

        // Trigger conditional activation API flow (backend only)
        processConditionalOrderActivation(orderId).catch(err => logger.error('[Order System] Activation flow error:', err.message));

        return {
            success: true,
            statusCode: 200,
            message: 'Order completed successfully',
            data: {
                orderId,
                woohooOrderId: woohooResponse.orderId,
                status: 'SUCCESS',
                gift_card_number: mainCard.cardNumber || mainCard.card_number || mainCard.cardNo || mainCard.number || mainCard.card_no || "",
                gift_card_pin: mainCard.cardPin || mainCard.card_pin || mainCard.pin || mainCard.activationCode || mainCard.activation_code || "",
                expiry_date: mainCard.validity || mainCard.expiryDate || mainCard.expiry_date || mainCard.expiry || null,
                wallet_amount: totalAmount,
                online_amount: 0,
                payment_type: GIFT_CARD_ORDER_PAYMENT_TYPE.WALLET_ONLY,
                cards: cards.map(c => ({
                    cardId: c.cardId || c.card_id || c.id || null,
                    sku: c.sku || null,
                    productName: c.productName || c.product_name || c.name || null,
                    cardNumber: c.cardNumber || c.card_number || c.cardNo || c.number || c.card_no || "",
                    cardPin: c.cardPin || c.card_pin || c.pin || c.activationCode || c.activation_code || "",
                    barcode: c.barcode || null,
                    amount: c.amount || null,
                    validity: c.validity || c.expiryDate || c.expiry_date || c.expiry || null,
                    issuanceDate: c.issuanceDate || c.issuance_date || null,
                    cardView: {
                        identifier: c.cardView?.identifier || c.card_view?.identifier || null
                    }
                }))
            }
        };

    } catch (apiErr) {
        const apiErrorMsg = apiErr.response?.data?.message || apiErr.message;
        logger.error('[Order System] Woohoo API call exception. Refunding wallet.', { error: apiErrorMsg });
        await runInTransaction(async (conn) => {
            await creditWallet(userId, totalAmount, WALLET_TRANSACTION_SOURCE.REFUND, orderId, `Woohoo error: ${apiErrorMsg}`, conn);
            await conn.query('UPDATE gift_card_orders SET status = 4, failure_reason = ? WHERE id = ?', [`Woohoo error: ${apiErrorMsg}`, orderId]);
        });
        return {
            success: false,
            statusCode: 500,
            message: `Provider order request failed: ${apiErrorMsg}. Wallet has been refunded.`
        };
    }
};

// ─── Order History ─────────────────────────────────────────────────────────────

/**
 * Fetch authenticated user's order history
 */
export const getOrderHistoryService = async (userId, page = 1, limit = 10) => {
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.max(1, parseInt(limit) || 10);
    const offset = (parsedPage - 1) * parsedLimit;

    const [[countResult], [orders]] = await Promise.all([
        pool.query(
            `SELECT COUNT(*) as total
             FROM gift_card_orders gco
             WHERE gco.user_id = ?`,
            [userId]
        ),
        pool.query(
            `SELECT gco.id, gc.brand_name, gco.amount, gco.discount_amount, gco.cashback_amount, gco.payable_amount,
                    gco.status, gco.created_at, gco.woohoo_reference_no, gco.quantity,
                    gco.wallet_amount, gco.online_amount, gco.payment_type
             FROM gift_card_orders gco
             JOIN gift_cards gc ON gco.gift_card_id = gc.id
             WHERE gco.user_id = ?
             ORDER BY gco.id DESC
             LIMIT ? OFFSET ?`,
            [userId, parsedLimit, offset]
        )
    ]);

    const totalOrders = countResult[0]?.total || 0;

    const formattedOrders = orders.map(o => ({
        ...o,
        amount: parseFloat(o.amount) || 0,
        discount_amount: parseFloat(o.discount_amount) || 0,
        cashback_amount: parseFloat(o.cashback_amount) || 0,
        payable_amount: parseFloat(o.payable_amount) || 0,
        wallet_amount: parseFloat(o.wallet_amount) || 0,
        online_amount: parseFloat(o.online_amount) || 0,
        quantity: parseInt(o.quantity) || 0
    }));

    const totalPages = Math.ceil(totalOrders / parsedLimit);

    return {
        success: true,
        statusCode: 200,
        message: 'Order history fetched successfully',
        data: formattedOrders,
        pagination: {
            total: totalOrders,
            page: parsedPage,
            limit: parsedLimit,
            totalPages
        }
    };
};

// ─── Get Order By ID ───────────────────────────────────────────────────────────

/**
 * Get Order Details with Payment Breakdown by ID
 */
export const getOrderById = async (userId, orderId) => {
    const [orderResult, itemsResult] = await Promise.all([
        pool.query(
            `SELECT id, user_id, gift_card_id, amount, sku, quantity, status, is_self_purchase,
                    recipient_name, recipient_email, recipient_mobile, gift_message,
                    wallet_amount, online_amount, payment_type, woohoo_order_id,
                    woohoo_reference_no, offer_id, discount_amount, cashback_amount, 
                    payable_amount, failure_reason, created_at
             FROM gift_card_orders WHERE id = ?`,
            [orderId]
        ),
        pool.query(
            `SELECT id, woohoo_card_id, sku, product_name, card_number, card_pin, barcode, amount, validity, issuance_date, card_view_identifier 
             FROM gift_card_order_items WHERE order_id = ?`,
            [orderId]
        )
    ]);

    const [[order]] = orderResult;
    if (!order) {
        throw { message: 'Order not found', code: 'NOT_FOUND', statusCode: 404 };
    }
    if (order.user_id !== userId) {
        throw { message: 'Order does not belong to this user', code: 'UNAUTHORIZED', statusCode: 403 };
    }

    const [items] = itemsResult;
    const formattedCards = items.map(item => ({
        id: item.id,
        card_number: decrypt(item.card_number),
        card_pin: decrypt(item.card_pin),
        amount: parseFloat(item.amount) || 0,
        validity: item.validity,
        sku: item.sku,
        productName: item.product_name,
        cardId: item.woohoo_card_id,
        barcode: item.barcode,
        issuanceDate: item.issuance_date,
        cardView: {
            identifier: item.card_view_identifier
        }
    }));

    const formattedOrder = {
        ...order,
        amount: parseFloat(order.amount) || 0,
        discount_amount: parseFloat(order.discount_amount) || 0,
        cashback_amount: parseFloat(order.cashback_amount) || 0,
        payable_amount: parseFloat(order.payable_amount) || 0,
        wallet_amount: parseFloat(order.wallet_amount) || 0,
        online_amount: parseFloat(order.online_amount) || 0,
        quantity: parseInt(order.quantity) || 0,
        // Backward compatibility: provide the first card's details on the order object itself
        gift_card_number: formattedCards[0]?.card_number || null,
        gift_card_pin: formattedCards[0]?.card_pin || null,
        expiry_date: formattedCards[0]?.validity || null
    };

    return {
        success: true,
        data: {
            order: formattedOrder,
            cards: formattedCards
        }
    };
};

// ─── Place Gift Card Order Flow (3 payment types) ──────────────────────────────

/**
 * Main sequence flow for placing a Gift Card order.
 * Supports Wallet Only, Online Only, and Split Payment.
 * Entire payment + order creation is atomic inside runInTransaction.
 */
export const placeGiftCardOrderFlow = async (userId, payload) => {
    const {
        giftcard_id,
        sku,
        price,
        qty,
        payment_type,
        payment_method,
        is_self_purchase,
        recipient_name,
        recipient_email,
        recipient_mobile,
        gift_message,
        promo_code,
        offer_id
    } = payload;

    const totalAmount = parseFloat(price) * parseInt(qty);

    logger.info(`[Order Flow] Initiating order. User: ${userId}, Total: ₹${totalAmount}, PaymentType: ${payment_type}`);

    // Map payment_type string to constant
    let paymentTypeInt;
    if (typeof payment_type === 'string') {
        const ptLower = payment_type.toLowerCase();
        if (ptLower === 'wallet') paymentTypeInt = GIFT_CARD_ORDER_PAYMENT_TYPE.WALLET_ONLY;
        else if (ptLower === 'online') paymentTypeInt = GIFT_CARD_ORDER_PAYMENT_TYPE.ONLINE_ONLY;
        else if (ptLower === 'split') paymentTypeInt = GIFT_CARD_ORDER_PAYMENT_TYPE.SPLIT_PAYMENT;
    } else {
        paymentTypeInt = parseInt(payment_type);
    }

    if (![1, 2, 3].includes(paymentTypeInt)) {
        throw { message: 'Invalid payment type. Use Wallet, Online, or Split.', code: 'INVALID_PAYMENT_TYPE', statusCode: 400 };
    }

    // Map payment_method string to constant (for online portion)
    let paymentMethodInt = PAYMENT_METHOD.UPI; // default
    if (payment_method) {
        const pm = parseInt(payment_method);
        if ([1, 2, 3].includes(pm)) paymentMethodInt = pm;
    }

    // Fetch gift card details first
    const [[giftCard]] = await pool.query(
        `SELECT id, sku, store_id, gift_card_name, min_denomination, max_denomination
         FROM gift_cards WHERE id = ?`,
        [giftcard_id]
    );
    if (!giftCard) {
        throw { message: 'Gift card not found', code: 'NOT_FOUND', statusCode: 404 };
    }

    let targetOfferId = offer_id || null;
    let targetPromoCode = promo_code || null;

    // If no offer or promo code passed explicitly, resolve active offer automatically (gift-card first, then store)
    if (!targetOfferId && !targetPromoCode) {
        const { getApplicableOffer } = await import('../offers/offers.service.js');
        const applicableOffer = await getApplicableOffer(giftcard_id);
        if (applicableOffer) {
            targetOfferId = applicableOffer.id;
        }
    }

    let appliedOfferId = null;
    let discountAmount = 0.00;
    let cashbackAmount = 0.00;
    let payableAmount = totalAmount;

    // Validate active offers and calculate final payable amount if selected
    if (targetOfferId || targetPromoCode) {
        try {
            const offerResult = await validateOfferForOrder(
                userId,
                giftcard_id,
                giftCard.store_id,
                totalAmount,
                targetOfferId,
                targetPromoCode,
                pool
            );

            appliedOfferId = offerResult.offerId;
            discountAmount = offerResult.discountAmount;
            cashbackAmount = offerResult.cashbackAmount;
            payableAmount = offerResult.payableAmount;
        } catch (offerErr) {
            if (offer_id || promo_code) {
                throw offerErr;
            }
            logger.warn(`Auto-applied offer #${targetOfferId} skipped during checkout: ${offerErr.message}`);
        }
    }

    // Pre-flight: check wallet balance for Wallet Only (using payableAmount)
    if (paymentTypeInt === GIFT_CARD_ORDER_PAYMENT_TYPE.WALLET_ONLY) {
        const wallet = await getOrCreateWallet(userId);
        if (parseFloat(wallet.balance) < payableAmount) {
            throw {
                message: `Insufficient wallet balance. Required: ₹${payableAmount.toFixed(2)}, Available: ₹${parseFloat(wallet.balance).toFixed(2)}`,
                code: 'INSUFFICIENT_BALANCE',
                statusCode: 400
            };
        }
    }

    // Retrieve user details
    const [[user]] = await pool.query('SELECT name, email, phone FROM user_master WHERE id = ?', [userId]);
    const finalRecipientName = recipient_name || user?.name || 'Customer';
    const finalRecipientEmail = recipient_email || user?.email || 'customer@example.com';
    const finalRecipientMobile = recipient_mobile || user?.phone || '+918884520003';
    const isSelf = is_self_purchase !== undefined ? parseInt(is_self_purchase) : ((user && user.phone === finalRecipientMobile) ? 1 : 0);

    const woohooRefNo = generateWoohooRefNo(userId);

    // Stage 1: Deduct payment and insert order as PENDING (status = 0)
    let orderId;
    let deductRes;
    try {
        const stage1Result = await runInTransaction(async (connection) => {
            // Deduct payment based on payment type (orderId is not yet generated, pass null)
            const deduct = await deductPayment(
                userId,
                payableAmount,
                paymentTypeInt,
                null,
                paymentMethodInt,
                connection
            );

            // Insert gift_card_orders in PENDING (0) state
            const [orderResult] = await connection.query(
                `INSERT INTO gift_card_orders 
                 (user_id, gift_card_id, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
                  woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type,
                  woohoo_order_id, woohoo_response,
                  offer_id, discount_amount, cashback_amount, payable_amount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
                [
                    userId,
                    giftcard_id,
                    totalAmount,
                    isSelf,
                    isSelf === 1 ? null : finalRecipientName,
                    isSelf === 1 ? null : finalRecipientEmail,
                    isSelf === 1 ? null : finalRecipientMobile,
                    isSelf === 1 ? null : (gift_message || null),
                    woohooRefNo,
                    qty,
                    deduct.walletDeducted,
                    deduct.onlineDeducted,
                    paymentTypeInt,
                    appliedOfferId,
                    discountAmount,
                    cashbackAmount,
                    payableAmount
                ]
            );
            const insertedOrderId = orderResult.insertId;

            // Update wallet_transactions with the generated order_id
            if (deduct.walletTransactionId) {
                await connection.query(
                    'UPDATE wallet_transactions SET order_id = ?, remarks = ? WHERE id = ?',
                    [
                        insertedOrderId,
                        paymentTypeInt === GIFT_CARD_ORDER_PAYMENT_TYPE.SPLIT_PAYMENT
                            ? `Debit for order #${insertedOrderId} (split payment)`
                            : `Debit for order #${insertedOrderId}`,
                        deduct.walletTransactionId
                    ]
                );
            }

            // Update payment_transactions with the generated order_id
            if (deduct.paymentTxnNo) {
                await connection.query(
                    'UPDATE payment_transactions SET order_id = ? WHERE transaction_no = ?',
                    [insertedOrderId, deduct.paymentTxnNo]
                );
            }

            return { orderId: insertedOrderId, deduct };
        });

        orderId = stage1Result.orderId;
        deductRes = stage1Result.deduct;
        logger.info(`[Order Flow] Stage 1 complete. Created pending order #${orderId}.`);
    } catch (stage1Err) {
        logger.error(`[Order Flow] Stage 1 payment/pending order creation failed: ${stage1Err.message}`);
        throw {
            message: stage1Err.message || 'Payment/Order initialization failed',
            code: stage1Err.code || 'PAYMENT_FAILED',
            statusCode: stage1Err.statusCode || 400
        };
    }

    // Stage 2: Call external Woohoo API
    logger.info('[Order Flow] Sending request to downstream placeGiftCardOrder:', {
        woohooRefNo,
        sku,
        qty,
        price,
        totalAmount
    });

    let woohooResult;
    try {
        woohooResult = await placeGiftCardOrder({
            sku,
            price,
            qty,
            amount: totalAmount,
            refno: woohooRefNo
        });
    } catch (apiErr) {
        const errorData = apiErr.response?.data;
        const errorStatus = apiErr.response?.status || 500;

        logger.error(`[Order Flow] Woohoo API call failed or timed out: ${apiErr.message}`, {
            refno: woohooRefNo,
            sku,
            qty,
            price,
            totalAmount,
            statusCode: errorStatus,
            errorDetails: errorData
        });
        
        throw {
            message: `Order placement timed out or provider is unreachable. Your order is pending resolution. Reference: ${woohooRefNo}. Downstream message: ${JSON.stringify(errorData || apiErr.message)}`,
            code: 'PROVIDER_TIMEOUT',
            statusCode: 504
        };
    }

    // Stage 3: Resolve order based on Woohoo response
    if (!woohooResult.success) {
        // Clear rejection -> refund wallet portion and fail order
        logger.warn(`[Order Flow] Woohoo rejected the order: ${woohooResult.error}. Refunding...`, {
            refno: woohooRefNo,
            sku,
            qty,
            price,
            totalAmount,
            error: woohooResult.error
        });
        try {
            await runInTransaction(async (connection) => {
                await connection.query(
                    'UPDATE gift_card_orders SET status = 4, failure_reason = ? WHERE id = ?',
                    [`Woohoo error: ${woohooResult.error}`, orderId]
                );

                if (deductRes.walletDeducted > 0) {
                    await creditWallet(
                        userId,
                        deductRes.walletDeducted,
                        WALLET_TRANSACTION_SOURCE.REFUND,
                        orderId,
                        `Refund for failed order #${orderId}`,
                        connection
                    );
                }
            });
        } catch (refundErr) {
            logger.error(`[Order Flow] Refund failed for order #${orderId}: ${refundErr.message}`);
        }

        throw {
            message: `Woohoo provider order failed: ${woohooResult.error}. Wallet portion refunded if applicable.`,
            code: 'WOOHOO_FAILED',
            statusCode: 424
        };
    }

    // Resolve Woohoo response status
    const woohooResponseData = woohooResult.data || {};
    const statusStr = (woohooResponseData.status || '').toLowerCase();

    if (statusStr === 'failed' || statusStr === 'cancelled' || statusStr === 'rejected') {
        const errorReason = woohooResponseData.message || woohooResponseData.error || 'Rejected by provider';
        logger.warn(`[Order Flow] Woohoo order #${orderId} rejected with status '${statusStr}': ${errorReason}. Refunding...`);
        try {
            await runInTransaction(async (connection) => {
                await connection.query(
                    'UPDATE gift_card_orders SET status = 4, failure_reason = ? WHERE id = ?',
                    [`Woohoo error: ${errorReason}`, orderId]
                );

                if (deductRes.walletDeducted > 0) {
                    await creditWallet(
                        userId,
                        deductRes.walletDeducted,
                        WALLET_TRANSACTION_SOURCE.REFUND,
                        orderId,
                        `Refund for failed order #${orderId}`,
                        connection
                    );
                }
            });
        } catch (refundErr) {
            logger.error(`[Order Flow] Refund failed for order #${orderId}: ${refundErr.message}`);
        }

        throw {
            message: `Woohoo provider order failed: ${errorReason}. Wallet portion refunded if applicable.`,
            code: 'WOOHOO_FAILED',
            statusCode: 424
        };
    }

    if (statusStr === 'processing' || statusStr === 'pending') {
        logger.info(`[Order Flow] Woohoo order #${orderId} is processing asynchronously on provider side.`);
        await pool.query(
            'UPDATE gift_card_orders SET status = 1, woohoo_order_id = ?, woohoo_response = ? WHERE id = ?',
            [woohooResponseData.orderId || null, JSON.stringify(woohooResponseData), orderId]
        );
        return {
            success: true,
            message: 'Order is processing asynchronously',
            data: {
                orderId,
                woohooOrderId: woohooResponseData.orderId,
                status: 'PROCESSING'
            }
        };
    }

    // Direct success with cards available or completed status!
    const cards = woohooResponseData.cards || (woohooResponseData.card ? [woohooResponseData.card] : []);

    try {
        const finalOrder = await runInTransaction(async (connection) => {
            await connection.query(
                `UPDATE gift_card_orders 
                 SET status = 2, 
                     woohoo_order_id = ?, 
                     woohoo_response = ?
                 WHERE id = ?`,
                [
                    woohooResponseData.orderId || null,
                    JSON.stringify(woohooResponseData),
                    orderId
                ]
            );

            // Insert child cards
            if (cards.length > 0) {
                const itemValues = cards.map(c => [
                    orderId,
                    c.cardId || c.card_id || c.id || null,
                    c.sku || null,
                    c.productName || c.product_name || c.name || null,
                    encrypt(c.cardNumber || c.card_number || c.cardNo || c.number || c.card_no || ""),
                    encrypt(c.cardPin || c.card_pin || c.pin || c.activationCode || c.activation_code || ""),
                    c.barcode || null,
                    c.amount || null,
                    c.validity || c.expiryDate || c.expiry_date || c.expiry || null,
                    c.issuanceDate || c.issuance_date || null,
                    c.cardView?.identifier || c.card_view?.identifier || null
                ]);
                await connection.query(
                    `INSERT INTO gift_card_order_items 
                     (order_id, woohoo_card_id, sku, product_name, card_number, card_pin, barcode, amount, validity, issuance_date, card_view_identifier) 
                     VALUES ?`,
                    [itemValues]
                );
            }

            // Fetch updated order row
            const [[orderRow]] = await connection.query(
                `SELECT id, user_id, gift_card_id, amount, status, wallet_amount,
                        online_amount, discount_amount, cashback_amount, payable_amount,
                        woohoo_reference_no, woohoo_order_id, quantity, payment_type
                 FROM gift_card_orders WHERE id = ?`,
                [orderId]
            );

            // Fetch created card items for return
            const [items] = await connection.query(
                `SELECT id, woohoo_card_id, sku, product_name, card_number, card_pin, barcode, amount, validity, issuance_date, card_view_identifier 
                 FROM gift_card_order_items WHERE order_id = ?`,
                [orderId]
            );
            const formattedCards = items.map(item => ({
                id: item.id,
                card_number: decrypt(item.card_number),
                card_pin: decrypt(item.card_pin),
                amount: parseFloat(item.amount) || 0,
                validity: item.validity,
                sku: item.sku,
                productName: item.product_name,
                cardId: item.woohoo_card_id,
                barcode: item.barcode,
                issuanceDate: item.issuance_date,
                cardView: {
                    identifier: item.card_view_identifier
                }
            }));

            // Credit cashback if cashback_amount > 0 with idempotency check
            if (orderRow && parseFloat(orderRow.cashback_amount) > 0) {
                const [[existingTxn]] = await connection.query(
                    'SELECT id FROM wallet_transactions WHERE order_id = ? AND source = ?',
                    [orderId, WALLET_TRANSACTION_SOURCE.CASHBACK]
                );
                if (!existingTxn) {
                    await creditWallet(
                        userId,
                        parseFloat(orderRow.cashback_amount),
                        WALLET_TRANSACTION_SOURCE.CASHBACK,
                        orderId,
                        `Cashback reward for order #${orderId}`,
                        connection
                    );

                    await connection.query(
                        'UPDATE user_wallet SET total_cashback_earned = total_cashback_earned + ? WHERE user_id = ?',
                        [parseFloat(orderRow.cashback_amount), userId]
                    );
                }
            }

            // Assign for backward compatibility
            orderRow.gift_card_number = formattedCards[0]?.card_number || null;
            orderRow.gift_card_pin = formattedCards[0]?.card_pin || null;
            orderRow.expiry_date = formattedCards[0]?.validity || null;
            orderRow.cards = formattedCards;

            return orderRow;
        });

        logger.info(`[Order Flow] Order #${finalOrder.id} completed successfully`);

        // Trigger order completion email (non-blocking)
        sendOrderCompletionEmailByOrderId(finalOrder.id).catch(err => logger.error('[Order Flow] Email notification error:', err));

        // Trigger conditional activation API flow (backend only)
        processConditionalOrderActivation(finalOrder.id).catch(err => logger.error('[Order Flow] Activation flow error:', err.message));

        return {
            success: true,
            message: 'Order completed successfully',
            data: {
                ...finalOrder,
                amount: parseFloat(finalOrder.amount) || 0,
                discount_amount: parseFloat(finalOrder.discount_amount) || 0,
                cashback_amount: parseFloat(finalOrder.cashback_amount) || 0,
                payable_amount: parseFloat(finalOrder.payable_amount) || 0
            }
        };
    } catch (finalErr) {
        logger.error(`[Order Flow] Failed to save completed order details: ${finalErr.message}`);
        throw {
            message: `Order completed at provider but failed to save details locally. Please contact support. Ref: ${woohooRefNo}`,
            code: 'LOCAL_SAVE_FAILED',
            statusCode: 500
        };
    }
};

// ─── Cashback Credit ───────────────────────────────────────────────────────────

/**
 * Credit cashback to user's wallet after successful order.
 * @param {number} userId
 * @param {number} orderId
 * @param {number} orderAmount - total order amount
 * @param {number} cashbackPercentage
 * @param {object} connection - DB connection (inside transaction)
 */
export const creditCashback = async (userId, orderId, orderAmount, cashbackPercentage, connection) => {
    const cashbackAmount = parseFloat(((parseFloat(orderAmount) * parseFloat(cashbackPercentage)) / 100).toFixed(2));
    if (cashbackAmount <= 0) return;

    const db = connection || pool;
    const [[existingTxn]] = await db.query(
        'SELECT id FROM wallet_transactions WHERE order_id = ? AND source = ?',
        [orderId, WALLET_TRANSACTION_SOURCE.CASHBACK]
    );
    if (existingTxn) return;

    logger.info(`[Cashback] Crediting ₹${cashbackAmount} cashback for Order #${orderId} (${cashbackPercentage}%)`);

    // Credit wallet
    await creditWallet(
        userId,
        cashbackAmount,
        WALLET_TRANSACTION_SOURCE.CASHBACK,
        orderId,
        `Cashback ${cashbackPercentage}% for order #${orderId}`,
        db
    );

    // Update total_cashback_earned in user_wallet
    await db.query(
        'UPDATE user_wallet SET total_cashback_earned = total_cashback_earned + ? WHERE user_id = ?',
        [cashbackAmount, userId]
    );

    logger.info(`[Cashback] ₹${cashbackAmount} cashback credited to User ${userId}`);
};

// ─── Refund Order to Wallet ────────────────────────────────────────────────────

/**
 * Refund a successful order's wallet portion back to the user's wallet.
 * Only the wallet_amount is refunded (not the online portion).
 * @param {number} userId
 * @param {number} orderId
 */
export const refundOrderToWalletService = async (userId, orderId) => {
    return await runInTransaction(async (connection) => {
        // 1. Fetch and lock order
        const [[order]] = await connection.query(
            `SELECT id, user_id, gift_card_id, amount, status, wallet_amount,
                    online_amount, cashback_amount, woohoo_reference_no, payment_type
             FROM gift_card_orders WHERE id = ? FOR UPDATE`,
            [orderId]
        );

        if (!order) {
            throw { message: 'Order not found', code: 'NOT_FOUND', statusCode: 404 };
        }

        if (order.user_id !== userId) {
            throw { message: 'Order does not belong to this user', code: 'UNAUTHORIZED', statusCode: 403 };
        }

        // Check order status is Success (2) — only successful orders can be refunded
        if (order.status !== 2) {
            throw { message: 'Only successful orders can be refunded', code: 'INVALID_STATUS', statusCode: 400 };
        }

        const refundAmount = parseFloat(order.wallet_amount) || 0;
        if (refundAmount <= 0) {
            throw { message: 'No wallet amount to refund for this order', code: 'NO_REFUND', statusCode: 400 };
        }

        // 2. Credit wallet
        const creditRes = await creditWallet(
            userId,
            refundAmount,
            WALLET_TRANSACTION_SOURCE.REFUND,
            orderId,
            `Refund for order #${orderId}`,
            connection
        );

        // 3. Mark order as Refunded (status = 5)
        await connection.query(
            'UPDATE gift_card_orders SET status = 5 WHERE id = ?',
            [orderId]
        );

        // 4. Fetch updated wallet balance
        const [[updatedWallet]] = await connection.query(
            'SELECT balance FROM user_wallet WHERE user_id = ?',
            [userId]
        );

        logger.info(`[Refund] Order #${orderId} refunded. ₹${refundAmount} credited to User ${userId}`);

        return {
            success: true,
            message: 'Order refunded successfully',
            refunded_amount: refundAmount,
            new_balance: parseFloat(updatedWallet.balance).toFixed(2),
            transaction_no: creditRes.transactionNo
        };
    });
};

/**
 * Cron task: Resolve all orders currently stuck in PENDING (status = 0) state
 */
export const resolvePendingOrdersService = async () => {
    // 1. Fetch all orders that have been stuck in PENDING (status = 0) or PROCESSING (status = 1) for more than 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const [pendingOrders] = await pool.query(
        `SELECT id, user_id, woohoo_reference_no, cashback_amount, wallet_amount, status
         FROM gift_card_orders 
         WHERE (status = 0 OR status = 1) AND created_at <= ?`,
        [twoMinutesAgo]
    );

    if (pendingOrders.length === 0) {
        return;
    }

    logger.info(`[Cron Resolver] Found ${pendingOrders.length} pending/processing orders to resolve.`);
    const token = await getWoohooToken();

    for (const order of pendingOrders) {
        try {
            logger.info(`[Cron Resolver] Checking status of Order #${order.id} (Ref: ${order.woohoo_reference_no})`);
            const woohooRes = await getWoohooOrderByRefNo(token, order.woohoo_reference_no);

            // If the order has status 'COMPLETE' or 'SUCCESS' or 'COMPLETED'
            const statusStr = (woohooRes.status || '').toLowerCase();
            const cards = woohooRes.cards || (woohooRes.card ? [woohooRes.card] : []);
            
            if (statusStr === 'complete' || statusStr === 'success' || statusStr === 'completed') {
                const mainCard = cards[0];
                await runInTransaction(async (connection) => {
                    await connection.query(
                        `UPDATE gift_card_orders 
                         SET status = 2, 
                             woohoo_order_id = ?, 
                             woohoo_response = ?
                         WHERE id = ?`,
                        [
                            woohooRes.orderId || null,
                            JSON.stringify(woohooRes),
                            order.id
                        ]
                    );

                    // Insert child cards
                    if (cards.length > 0) {
                        const itemValues = cards.map(c => [
                            order.id,
                            c.cardId || c.card_id || c.id || null,
                            c.sku || null,
                            c.productName || c.product_name || c.name || null,
                            encrypt(c.cardNumber || c.card_number || c.cardNo || c.number || c.card_no || ""),
                            encrypt(c.cardPin || c.card_pin || c.pin || c.activationCode || c.activation_code || ""),
                            c.barcode || null,
                            c.amount || null,
                            c.validity || c.expiryDate || c.expiry_date || c.expiry || null,
                            c.issuanceDate || c.issuance_date || null,
                            c.cardView?.identifier || c.card_view?.identifier || null
                        ]);
                        await connection.query(
                            `INSERT INTO gift_card_order_items 
                             (order_id, woohoo_card_id, sku, product_name, card_number, card_pin, barcode, amount, validity, issuance_date, card_view_identifier) 
                             VALUES ?`,
                            [itemValues]
                        );
                    }

                    // Credit cashback if cashback_amount > 0
                    if (order && parseFloat(order.cashback_amount) > 0) {
                        await creditWallet(
                            order.user_id,
                            parseFloat(order.cashback_amount),
                            WALLET_TRANSACTION_SOURCE.CASHBACK,
                            order.id,
                            `Cashback reward for order #${order.id}`,
                            connection
                        );

                        // Update total_cashback_earned in user_wallet
                        await connection.query(
                            'UPDATE user_wallet SET total_cashback_earned = total_cashback_earned + ? WHERE user_id = ?',
                            [parseFloat(order.cashback_amount), order.user_id]
                        );
                    }
                });
                logger.info(`[Cron Resolver] Resolved Order #${order.id} as COMPLETE.`);

                // Trigger order completion email (non-blocking)
                sendOrderCompletionEmailByOrderId(order.id).catch(err => logger.error('[Cron Resolver] Email notification error:', err));

                // Trigger conditional activation API flow (backend only)
                processConditionalOrderActivation(order.id).catch(err => logger.error('[Cron Resolver] Activation flow error:', err.message));
            } else if (statusStr === 'failed' || statusStr === 'cancelled') {
                // Clear rejection or cancelled by provider -> fail order and refund wallet
                await runInTransaction(async (connection) => {
                    await connection.query(
                        'UPDATE gift_card_orders SET status = 4, failure_reason = ? WHERE id = ?',
                        [`Woohoo error: ${woohooRes.message || 'Cancelled by provider'}`, order.id]
                    );



                    const walletAmount = parseFloat(order.wallet_amount) || 0;
                    if (walletAmount > 0) {
                        await creditWallet(
                            order.user_id,
                            walletAmount,
                            WALLET_TRANSACTION_SOURCE.REFUND,
                            order.id,
                            `Refund for failed order #${order.id}`,
                            connection
                        );
                    }
                });
                logger.info(`[Cron Resolver] Resolved Order #${order.id} as FAILED. Wallet portion refunded.`);
            } else {
                logger.info(`[Cron Resolver] Order #${order.id} is still in status '${statusStr}' on Woohoo.`);
            }
        } catch (err) {
            // If Woohoo returns 404/not found, it means the order was never actually created at the provider!
            // Thus, we can safely mark it as failed and refund the wallet!
            if (err.response?.status === 404) {
                logger.warn(`[Cron Resolver] Order #${order.id} not found at Woohoo. Refunding user...`);
                try {
                    await runInTransaction(async (connection) => {
                        await connection.query(
                            'UPDATE gift_card_orders SET status = 4, failure_reason = ? WHERE id = ?',
                            ['Order not found at provider', order.id]
                        );



                        const walletAmount = parseFloat(order.wallet_amount) || 0;
                        if (walletAmount > 0) {
                            await creditWallet(
                                order.user_id,
                                walletAmount,
                                WALLET_TRANSACTION_SOURCE.REFUND,
                                order.id,
                                `Refund for failed order #${order.id}`,
                                connection
                            );
                        }
                    });
                    logger.info(`[Cron Resolver] Order #${order.id} resolved as FAILED (not found).`);
                } catch (refundErr) {
                    logger.error(`[Cron Resolver] Failed to refund not-found order #${order.id}: ${refundErr.message}`);
                }
            } else {
                logger.error(`[Cron Resolver] Error checking Order #${order.id}: ${err.message}`);
            }
        }
    }
};

/**
 * Persist an externally placed order (e.g. via direct Woohoo/Spend proxy endpoint)
 */
export const persistExternalOrder = async (userId, body, woohooResponse) => {
    const refno = body.refno;
    const products = body.products || [];
    const sku = products[0]?.sku;
    const qty = parseInt(products[0]?.qty) || 1;
    const price = parseFloat(products[0]?.price) || 0;
    const totalAmount = price * qty;

    const payments = body.payments || [];
    const walletAmount = payments.find(p => p.code?.toLowerCase() === 'wallet')?.amount || 0;
    const onlineAmount = payments.find(p => p.code?.toLowerCase() === 'online' || p.code?.toLowerCase() === 'pg' || p.code?.toLowerCase() === 'card')?.amount || 0;

    // Resolve gift card
    const [[giftCard]] = await pool.query(
        'SELECT id, gift_card_name FROM gift_cards WHERE sku = ? LIMIT 1',
        [sku]
    );
    const giftCardId = giftCard ? giftCard.id : null;

    // Check if order already exists (idempotency/duplicate prevention)
    const [[existingOrder]] = await pool.query(
        'SELECT id FROM gift_card_orders WHERE woohoo_reference_no = ?',
        [refno]
    );
    if (existingOrder) {
        logger.info(`[Order System] External order already persisted. ID: ${existingOrder.id}`);
        return existingOrder.id;
    }

    // Save to database in a transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // Insert gift_card_orders
        const [orderResult] = await connection.query(
            `INSERT INTO gift_card_orders 
              (user_id, gift_card_id, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message, 
               wallet_transaction_id, woohoo_reference_no, woohoo_order_id, status, wallet_amount, online_amount, payment_type, quantity, cashback_amount, payable_amount)
             VALUES (?, ?, ?, 1, null, null, null, null, null, ?, ?, 2, ?, ?, 1, ?, 0.00, ?)`,
            [
                userId,
                giftCardId,
                totalAmount,
                refno,
                woohooResponse.orderId || null,
                walletAmount,
                onlineAmount,
                qty,
                totalAmount
            ]
        );
        const orderId = orderResult.insertId;

        // Insert items
        const cards = woohooResponse.cards || [];
        if (cards.length > 0) {
            const itemValues = cards.map(c => {
                const parsedCardId = parseInt(c.cardId || c.card_id || c.id);
                const cardIdVal = isNaN(parsedCardId) ? null : parsedCardId;
                return [
                    orderId,
                    cardIdVal,
                    c.sku || sku || null,
                    c.productName || c.product_name || c.name || (giftCard ? giftCard.gift_card_name : null),
                    encrypt(c.cardNumber || c.card_number || c.cardNo || c.number || c.card_no || ""),
                    encrypt(c.cardPin || c.card_pin || c.pin || c.activationCode || c.activation_code || ""),
                    c.barcode || null,
                    c.amount || price || null,
                    c.validity || c.expiryDate || c.expiry_date || c.expiry || null,
                    c.issuanceDate || c.issuance_date || null,
                    c.cardView?.identifier || c.card_view?.identifier || null
                ];
            });

            await connection.query(
                `INSERT INTO gift_card_order_items 
                  (order_id, woohoo_card_id, sku, product_name, card_number, card_pin, barcode, amount, validity, issuance_date, card_view_identifier) 
                  VALUES ?`,
                [itemValues]
            );
        }

        await connection.commit();
        logger.info(`[Order System] Successfully persisted external order ID: ${orderId}`);

        // Trigger order completion email (non-blocking)
        sendOrderCompletionEmailByOrderId(orderId).catch(err => logger.error('[Order System] Email notification error:', err));

        return orderId;
    } catch (err) {
        await connection.rollback();
        logger.error('[Order System] Failed to persist external order:', err);
        throw err;
    } finally {
        connection.release();
    }
};

/**
 * Helper to fetch order details and trigger order completion email
 * @param {number} orderId
 */
export const sendOrderCompletionEmailByOrderId = async (orderId) => {
    try {
        const [[orderRow]] = await pool.query(
            `SELECT id, user_id, gift_card_id, recipient_email, recipient_name, is_self_purchase, amount
             FROM gift_card_orders WHERE id = ?`,
            [orderId]
        );
        if (!orderRow) return;

        // Run independent queries in parallel using Promise.all per AGENTS.md performance guidelines
        const [[userRes], [cardInfoRes], [cardItems]] = await Promise.all([
            pool.query('SELECT name, email FROM user_master WHERE id = ?', [orderRow.user_id]),
            orderRow.gift_card_id 
                ? pool.query('SELECT gift_card_name, brand_name, tnc_link, things_to_note, redeem_steps, description FROM gift_cards WHERE id = ?', [orderRow.gift_card_id])
                : Promise.resolve([[]]),
            pool.query(
                `SELECT card_number, card_pin, validity, amount, product_name 
                 FROM gift_card_order_items WHERE order_id = ?`,
                [orderId]
            )
        ]);

        const user = userRes[0] || {};
        const giftCard = cardInfoRes[0] || {};

        // Recipient email if provided (and not self purchase), else purchaser user email
        const targetEmail = (orderRow.recipient_email && orderRow.is_self_purchase === 0) 
            ? orderRow.recipient_email 
            : user.email;

        if (!targetEmail) {
            logger.warn(`[Order Flow] Cannot send completion email for Order #${orderId}: No target email address found.`);
            return;
        }

        const customerName = (orderRow.recipient_name && orderRow.is_self_purchase === 0)
            ? orderRow.recipient_name
            : (user.name || 'Customer');

        // Decrypt card number & pin for each item
        const formattedCards = cardItems.map(item => ({
            cardNumber: decrypt(item.card_number),
            cardPin: decrypt(item.card_pin),
            validity: item.validity,
            amount: parseFloat(item.amount) || 0,
            productName: item.product_name
        }));

        const tncContent = giftCard.things_to_note || giftCard.redeem_steps || giftCard.description || null;

        await sendOrderCompletionEmail({
            to: targetEmail,
            customerName,
            orderId: orderRow.id,
            giftCardName: giftCard.gift_card_name || giftCard.brand_name || 'Gift Card',
            cards: formattedCards,
            tncLink: giftCard.tnc_link || null,
            tncContent
        });
    } catch (err) {
        logger.error(`[Order Flow] Failed to process completion email for Order #${orderId}: ${err.message}`);
    }
};

