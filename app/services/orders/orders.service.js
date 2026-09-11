import pool, { runInTransaction } from '../../config/dbConfig.js';
import { getWoohooToken, refreshWoohooToken } from '../categories/woohooAuth.service.js';
import { placeWoohooOrder, getWoohooOrderByRefNo } from '../woohoo/woohoo.service.js';
import { creditWallet, getOrCreateWallet, generateWalletTxnNo } from '../wallets/wallets.service.js';
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
import { processConditionalOrderActivation, extractCardsFromWoohooResponse } from '../activation/activation.service.js';
import { sendOrderCompletionEmail } from '../../helpers/email.helper.js';

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
 */
export const placeOrderService = async (userId, orderData) => {
    const { gift_card_id, amount, recipient_name, recipient_email, recipient_mobile, gift_message } = orderData;
    const totalAmount = parseFloat(amount);

    // Fetch user and gift card details in parallel (AGENTS.md Rule 2)
    const [[[user]], [[giftCard]]] = await Promise.all([
        pool.query('SELECT name, email, phone FROM user_master WHERE id = ?', [userId]),
        pool.query(
            `SELECT id, sku, gift_card_name, min_denomination, max_denomination, cashback_percentage
             FROM gift_cards WHERE id = ? AND status = 1`,
            [gift_card_id]
        )
    ]);

    if (!user) {
        return { success: false, statusCode: 404, message: 'User account not found' };
    }

    if (!giftCard) {
        return { success: false, statusCode: 400, message: 'Gift card is inactive or does not exist' };
    }

    const minDenom = parseFloat(giftCard.min_denomination) || 0;
    const maxDenom = parseFloat(giftCard.max_denomination) || 9999999;
    if (totalAmount < minDenom || totalAmount > maxDenom) {
        return {
            success: false,
            statusCode: 400,
            message: `Amount ₹${totalAmount.toFixed(2)} must be between ₹${minDenom.toFixed(2)} and ₹${maxDenom.toFixed(2)}`
        };
    }

    const wallet = await getOrCreateWallet(userId);
    const currentBalance = parseFloat(wallet.balance) || 0.00;
    if (currentBalance < totalAmount) {
        return {
            success: false,
            statusCode: 400,
            message: `Insufficient Wallet Balance. Required: ₹${totalAmount.toFixed(2)}, Available: ₹${currentBalance.toFixed(2)}`
        };
    }

    const isSelfPurchase = (user.phone && recipient_mobile === user.phone) ? 1 : 0;
    const company = await getCompanyDetails();
    const orderPayload = buildWoohooPayload(
        { amount: totalAmount, recipient_name, recipient_email, recipient_mobile, gift_message },
        giftCard,
        company
    );
    const refno = orderPayload.refno;

    // Call Woohoo API BEFORE debiting wallet
    let bearerToken;
    try {
        bearerToken = await getWoohooToken();
    } catch (authErr) {
        logger.error('[Order System] Woohoo authentication failed. Order not placed.', { error: authErr.message });
        await pool.query(
            `INSERT INTO gift_card_orders 
             (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
              woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, failure_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4, 1, 0.00, 0.00, 1, ?)`,
            [
                userId, giftCard.id, giftCard.sku, totalAmount, isSelfPurchase,
                isSelfPurchase === 1 ? null : recipient_name,
                isSelfPurchase === 1 ? null : recipient_email,
                isSelfPurchase === 1 ? null : recipient_mobile,
                isSelfPurchase === 1 ? null : (gift_message || null),
                refno, 'Woohoo OAuth token failed'
            ]
        );
        return { success: false, statusCode: 500, message: 'Provider authentication failed. Money was not debited.' };
    }

    try {
        const woohooResponse = await placeWoohooOrder(bearerToken, orderPayload);
        const statusStr = (woohooResponse.status || '').toLowerCase();

        let dbOrderStatus = 1; // PROCESSING
        if (statusStr === 'complete' || statusStr === 'success') {
            dbOrderStatus = 2; // COMPLETE
        } else if (statusStr === 'failed' || statusStr === 'cancelled' || statusStr === 'rejected') {
            dbOrderStatus = 4; // FAILED
        }

        if (dbOrderStatus === 4) {
            logger.error('[Order System] Woohoo order rejected. Money not debited.', { status: statusStr });
            await pool.query(
                `INSERT INTO gift_card_orders 
                 (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
                  woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, failure_reason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4, 1, 0.00, 0.00, 1, ?)`,
                [
                    userId, giftCard.id, giftCard.sku, totalAmount, isSelfPurchase,
                    isSelfPurchase === 1 ? null : recipient_name,
                    isSelfPurchase === 1 ? null : recipient_email,
                    isSelfPurchase === 1 ? null : recipient_mobile,
                    isSelfPurchase === 1 ? null : (gift_message || null),
                    refno, woohooResponse.message || 'Woohoo rejected order'
                ]
            );
            return {
                success: false,
                statusCode: 400,
                message: `Order rejected by provider: ${woohooResponse.message || 'Unknown error'}. Money was not debited.`,
                result: woohooResponse
            };
        }

        // Order confirmed / processing: Debit wallet and insert order in single transaction
        let orderId;
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
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

            await connection.query(
                'UPDATE user_wallet SET balance = balance - ? WHERE id = ?',
                [totalAmount, wallet.id]
            );

            const walletTxnNo = await generateWalletTxnNo(connection);
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

            const [orderResult] = await connection.query(
                `INSERT INTO gift_card_orders 
                 (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message, 
                  wallet_transaction_id, woohoo_reference_no, status, wallet_amount, online_amount, payment_type, woohoo_order_id, woohoo_response)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, 1, ?, ?)`,
                [
                    userId, giftCard.id, giftCard.sku, totalAmount, isSelfPurchase,
                    isSelfPurchase === 1 ? null : recipient_name,
                    isSelfPurchase === 1 ? null : recipient_email,
                    isSelfPurchase === 1 ? null : recipient_mobile,
                    isSelfPurchase === 1 ? null : (gift_message || null),
                    txnId, refno, dbOrderStatus, totalAmount,
                    woohooResponse.orderId || null, JSON.stringify(woohooResponse)
                ]
            );
            orderId = orderResult.insertId;

            await connection.query('UPDATE wallet_transactions SET order_id = ? WHERE id = ?', [orderId, txnId]);

            const cards = extractCardsFromWoohooResponse(woohooResponse);
            const mainCard = cards[0] || {};

            if (cards.length > 0) {
                const itemValues = cards.map(c => [
                    orderId,
                    c.cardId || c.card_id || c.id || null,
                    c.sku || giftCard.sku || null,
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

            await connection.commit();

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

            sendOrderCompletionEmailByOrderId(orderId).catch(err => logger.error('[Order System] Email notification error:', err));
            processConditionalOrderActivation(orderId).catch(err => logger.error('[Order System] Activation flow error:', err.message));

            return {
                success: true,
                statusCode: 200,
                message: 'Order completed successfully',
                data: {
                    orderId,
                    woohooOrderId: woohooResponse.orderId,
                    status: dbOrderStatus === 2 ? 'SUCCESS' : 'PROCESSING',
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
        } catch (dbErr) {
            await connection.rollback();
            logger.error('[Order System] Transaction rollback due to database error', { error: dbErr.message });
            return { success: false, statusCode: 500, message: 'Database transaction error during order placement' };
        } finally {
            connection.release();
        }

    } catch (apiErr) {
        const apiErrorMsg = apiErr.response?.data?.message || apiErr.message;
        logger.error('[Order System] Woohoo API call exception.', { error: apiErrorMsg });
        await pool.query(
            `INSERT INTO gift_card_orders 
             (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
              woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, failure_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4, 1, 0.00, 0.00, 1, ?)`,
            [
                userId, giftCard.id, giftCard.sku, totalAmount, isSelfPurchase,
                isSelfPurchase === 1 ? null : recipient_name,
                isSelfPurchase === 1 ? null : recipient_email,
                isSelfPurchase === 1 ? null : recipient_mobile,
                isSelfPurchase === 1 ? null : (gift_message || null),
                refno, `Woohoo error: ${apiErrorMsg}`
            ]
        );
        return {
            success: false,
            statusCode: 500,
            message: `Provider order request failed: ${apiErrorMsg}. Money was not debited.`
        };
    }
};

// ─── Order History ─────────────────────────────────────────────────────────────

/**
 * Fetch authenticated user's order history
 */
export const getOrderHistoryService = async (userId, page = 1, limit = 10) => {
    const pageNum = parseInt(page, 10) > 0 ? parseInt(page, 10) : 1;
    const limitNum = parseInt(limit, 10) > 0 ? parseInt(limit, 10) : 10;
    const offset = (pageNum - 1) * limitNum;

    // Parallel execution for count & dataset (AGENTS.md Rule 2)
    const [countRows, orders] = await Promise.all([
        pool.query('SELECT COUNT(*) as total FROM gift_card_orders WHERE user_id = ?', [userId]),
        pool.query(
            `SELECT gco.id, gco.gift_card_id, gco.sku, gco.amount, gco.is_self_purchase, 
                    gco.recipient_name, gco.recipient_email, gco.recipient_mobile, gco.gift_message, 
                    gco.status, gco.activation_status, gco.created_at, gco.woohoo_reference_no, gco.woohoo_reference_no AS reference_id,
                    gco.wallet_amount, gco.online_amount, gco.discount_amount, gco.cashback_amount, gco.payable_amount,
                    gc.gift_card_name, gc.brand_name, gc.gift_card_image AS image_url, gc.store_id
             FROM gift_card_orders gco
             LEFT JOIN gift_cards gc ON gco.gift_card_id = gc.id
             WHERE gco.user_id = ?
             ORDER BY gco.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limitNum, offset]
        )
    ]);

    const totalOrders = countRows[0][0].total;

    // Fetch items for fetched orders in parallel (AGENTS.md Rule 3)
    const formattedOrders = await Promise.all(
        orders[0].map(async (order) => {
            const [items] = await pool.query(
                `SELECT id, woohoo_card_id, sku, product_name, card_number, card_pin, barcode, amount, validity, issuance_date, card_view_identifier 
                 FROM gift_card_order_items WHERE order_id = ?`,
                [order.id]
            );

            const cards = items.map(item => ({
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

            const mainCard = cards[0] || {};

            return {
                ...order,
                amount: parseFloat(order.amount) || 0,
                wallet_amount: parseFloat(order.wallet_amount) || 0,
                online_amount: parseFloat(order.online_amount) || 0,
                discount_amount: parseFloat(order.discount_amount) || 0,
                cashback_amount: parseFloat(order.cashback_amount) || 0,
                payable_amount: parseFloat(order.payable_amount) || 0,
                gift_card_number: mainCard.card_number || null,
                gift_card_pin: mainCard.card_pin || null,
                expiry_date: mainCard.validity || null,
                cards
            };
        })
    );

    return {
        success: true,
        statusCode: 200,
        message: 'Order history fetched successfully',
        data: formattedOrders,
        pagination: {
            total: totalOrders,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(totalOrders / limitNum)
        }
    };
};

// ─── Get Order By ID ───────────────────────────────────────────────────────────

/**
 * Get Order Details with Payment Breakdown by ID
 */
export const getOrderById = async (userId, orderId) => {
    const [[order]] = await pool.query(
        `SELECT gco.id, gco.gift_card_id, gco.sku, gco.amount, gco.is_self_purchase, 
                gco.recipient_name, gco.recipient_email, gco.recipient_mobile, gco.gift_message, 
                gco.status, gco.activation_status, gco.created_at, gco.woohoo_reference_no, gco.woohoo_reference_no AS reference_id,
                gco.wallet_amount, gco.online_amount, gco.discount_amount, gco.cashback_amount, gco.payable_amount, gco.failure_reason,
                gc.gift_card_name, gc.brand_name, gc.gift_card_image AS image_url, gc.store_id
         FROM gift_card_orders gco
         LEFT JOIN gift_cards gc ON gco.gift_card_id = gc.id
         WHERE gco.id = ? AND gco.user_id = ?`,
        [orderId, userId]
    );

    if (!order) {
        throw { message: 'Order not found', code: 'NOT_FOUND', statusCode: 404 };
    }

    // Trigger on-demand activation resolution if pending
    if (order.status === 0 || order.status === 1 || (order.status === 4 && order.failure_reason?.toLowerCase().includes('timeout'))) {
        await processConditionalOrderActivation(orderId).catch(err => logger.error(`[Order System] Order #${orderId} on-demand resolution error:`, err.message));
        
        // Re-fetch order status after resolution attempt
        const [[refetched]] = await pool.query(
            `SELECT gco.status, gco.activation_status, gco.created_at, gco.woohoo_reference_no, gco.woohoo_reference_no AS reference_id,
                    gco.wallet_amount, gco.online_amount, gco.discount_amount, gco.cashback_amount, gco.payable_amount, gco.failure_reason
             FROM gift_card_orders gco WHERE gco.id = ?`,
            [orderId]
        );
        if (refetched) {
            order.status = refetched.status;
            order.activation_status = refetched.activation_status;
            order.failure_reason = refetched.failure_reason;
        }
    }

    const [items] = await pool.query(
        `SELECT id, woohoo_card_id, sku, product_name, card_number, card_pin, barcode, amount, validity, issuance_date, card_view_identifier 
         FROM gift_card_order_items WHERE order_id = ?`,
        [orderId]
    );

    const cards = items.map(item => ({
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

    const mainCard = cards[0] || {};

    return {
        success: true,
        statusCode: 200,
        message: 'Order details fetched successfully',
        data: {
            ...order,
            amount: parseFloat(order.amount) || 0,
            wallet_amount: parseFloat(order.wallet_amount) || 0,
            online_amount: parseFloat(order.online_amount) || 0,
            discount_amount: parseFloat(order.discount_amount) || 0,
            cashback_amount: parseFloat(order.cashback_amount) || 0,
            payable_amount: parseFloat(order.payable_amount) || 0,
            gift_card_number: mainCard.card_number || null,
            gift_card_pin: mainCard.card_pin || null,
            expiry_date: mainCard.validity || null,
            cards
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

    let paymentMethodInt = PAYMENT_METHOD.UPI;
    if (payment_method) {
        const pm = parseInt(payment_method);
        if ([1, 2, 3].includes(pm)) paymentMethodInt = pm;
    }

    // Parallel query execution for card and user (AGENTS.md Rule 2)
    const [[[giftCard]], [[user]]] = await Promise.all([
        pool.query(
            `SELECT id, sku, store_id, gift_card_name, min_denomination, max_denomination
             FROM gift_cards WHERE id = ? OR sku = ? LIMIT 1`,
            [giftcard_id, sku || giftcard_id]
        ),
        pool.query('SELECT name, email, phone FROM user_master WHERE id = ?', [userId])
    ]);

    if (!giftCard) {
        throw { message: 'Gift card not found', code: 'NOT_FOUND', statusCode: 404 };
    }

    let targetOfferId = offer_id || null;
    let targetPromoCode = promo_code || null;

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

    // Pre-flight wallet check
    if (paymentTypeInt === GIFT_CARD_ORDER_PAYMENT_TYPE.WALLET_ONLY || paymentTypeInt === GIFT_CARD_ORDER_PAYMENT_TYPE.SPLIT_PAYMENT) {
        const wallet = await getOrCreateWallet(userId);
        const availBalance = parseFloat(wallet.balance) || 0;
        if (paymentTypeInt === GIFT_CARD_ORDER_PAYMENT_TYPE.WALLET_ONLY && availBalance < payableAmount) {
            throw {
                message: `Insufficient wallet balance. Required: ₹${payableAmount.toFixed(2)}, Available: ₹${availBalance.toFixed(2)}`,
                code: 'INSUFFICIENT_BALANCE',
                statusCode: 400
            };
        }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const effectiveEmail = (recipient_email || user?.email || '').trim();

    if (!effectiveEmail || !emailRegex.test(effectiveEmail)) {
        throw {
            message: 'Email address is required to place an order.',
            code: 'EMAIL_REQUIRED',
            statusCode: 400
        };
    }

    if (!user?.email && effectiveEmail) {
        try {
            await pool.query('UPDATE user_master SET email = ? WHERE id = ?', [effectiveEmail, userId]);
        } catch (e) {
            // Silently ignore
        }
    }

    const finalRecipientName = recipient_name || user?.name || '';
    const finalRecipientEmail = effectiveEmail;
    const finalRecipientMobile = recipient_mobile || user?.phone || '';
    const isSelf = is_self_purchase !== undefined ? parseInt(is_self_purchase) : ((user && user.phone === finalRecipientMobile) ? 1 : 0);

    const woohooRefNo = generateWoohooRefNo(userId);
    const orderSku = giftCard.sku || payload.sku || null;

    logger.info('[Order Flow] Requesting Woohoo provider:', { woohooRefNo, sku: orderSku, qty, price, totalAmount });

    let woohooResult = null;
    let woohooApiException = null;

    try {
        woohooResult = await placeGiftCardOrder({
            sku: orderSku,
            price,
            qty,
            amount: totalAmount,
            refno: woohooRefNo
        });
    } catch (apiErr) {
        woohooApiException = apiErr;
    }

    // ─── 1. HANDLE API EXCEPTION ────────────────────────────────────────────────
    if (woohooApiException) {
        const errorData = woohooApiException.response?.data;
        const errorStatus = woohooApiException.response?.status || 500;
        const errorMsg = errorData?.message || woohooApiException.message || 'Provider is unreachable';
        const isTimeout = woohooApiException.code === 'ECONNABORTED' || errorMsg.toLowerCase().includes('timeout');

        logger.error(`[Order Flow] Woohoo API exception: ${errorMsg}`, { statusCode: errorStatus });

        if (isTimeout) {
            let orderId;
            await runInTransaction(async (connection) => {
                const deduct = await deductPayment(userId, payableAmount, paymentTypeInt, null, paymentMethodInt, connection);
                const [orderRes] = await connection.query(
                    `INSERT INTO gift_card_orders 
                     (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
                      woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, failure_reason,
                      offer_id, discount_amount, cashback_amount, payable_amount)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        userId, giftcard_id, orderSku, totalAmount, isSelf,
                        finalRecipientName, finalRecipientEmail, finalRecipientMobile,
                        isSelf === 1 ? null : (gift_message || null),
                        woohooRefNo, qty, deduct.walletDeducted, deduct.onlineDeducted, paymentTypeInt,
                        `Woohoo provider API timed out: ${errorMsg}`,
                        appliedOfferId, discountAmount, cashbackAmount, payableAmount
                    ]
                );
                orderId = orderRes.insertId;
                if (deduct.walletTransactionId) {
                    await connection.query('UPDATE wallet_transactions SET order_id = ? WHERE id = ?', [orderId, deduct.walletTransactionId]);
                }
            });

            logger.warn(`[Order Flow] Woohoo Order API timed out for Order #${orderId} (Ref: ${woohooRefNo}): ${errorMsg}. Saved order as PROCESSING for asynchronous reconciliation.`);

            return {
                success: true,
                message: 'Order is processing asynchronously',
                data: { orderId, status: 'PROCESSING' }
            };
        }

        // SYNCHRONOUS FAILURE: NO MONEY CUT, NO REFUND PROCESS!
        await pool.query(
            `INSERT INTO gift_card_orders 
             (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
              woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, failure_reason,
              offer_id, discount_amount, cashback_amount, payable_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4, ?, 0.00, 0.00, ?, ?, ?, ?, ?, ?)`,
            [
                userId, giftcard_id, orderSku, totalAmount, isSelf,
                finalRecipientName, finalRecipientEmail, finalRecipientMobile,
                isSelf === 1 ? null : (gift_message || null),
                woohooRefNo, qty, paymentTypeInt,
                `Woohoo provider order failed: ${errorMsg}`,
                appliedOfferId, discountAmount, cashbackAmount, payableAmount
            ]
        );

        throw {
            message: `Woohoo provider order failed: ${errorMsg}. Money was not debited.`,
            code: 'WOOHOO_FAILED',
            statusCode: 424
        };
    }

    // ─── 2. HANDLE WOO HOO RESULT (success = false) ─────────────────────────────
    if (!woohooResult.success) {
        const errorReason = woohooResult.error || 'Provider rejected order';
        const isTimeout = errorReason.toLowerCase().includes('timeout');

        if (isTimeout) {
            let orderId;
            await runInTransaction(async (connection) => {
                const deduct = await deductPayment(userId, payableAmount, paymentTypeInt, null, paymentMethodInt, connection);
                const [orderRes] = await connection.query(
                    `INSERT INTO gift_card_orders 
                     (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
                      woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, failure_reason,
                      offer_id, discount_amount, cashback_amount, payable_amount)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        userId, giftcard_id, orderSku, totalAmount, isSelf,
                        finalRecipientName, finalRecipientEmail, finalRecipientMobile,
                        isSelf === 1 ? null : (gift_message || null),
                        woohooRefNo, qty, deduct.walletDeducted, deduct.onlineDeducted, paymentTypeInt,
                        `Woohoo provider API timed out: ${errorReason}`,
                        appliedOfferId, discountAmount, cashbackAmount, payableAmount
                    ]
                );
                orderId = orderRes.insertId;
                if (deduct.walletTransactionId) {
                    await connection.query('UPDATE wallet_transactions SET order_id = ? WHERE id = ?', [orderId, deduct.walletTransactionId]);
                }
            });

            logger.warn(`[Order Flow] Woohoo Order API timed out for Order #${orderId} (Ref: ${woohooRefNo}): ${errorReason}. Saved order as PROCESSING for asynchronous reconciliation.`);

            return {
                success: true,
                message: 'Order is processing asynchronously',
                data: { orderId, status: 'PROCESSING' }
            };
        }

        // SYNCHRONOUS FAILURE: NO MONEY CUT, NO REFUND PROCESS!
        logger.warn(`[Order Flow] Provider rejected order: ${errorReason}. Money not debited.`);
        await pool.query(
            `INSERT INTO gift_card_orders 
             (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
              woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, failure_reason,
              offer_id, discount_amount, cashback_amount, payable_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4, ?, 0.00, 0.00, ?, ?, ?, ?, ?, ?)`,
            [
                userId, giftcard_id, orderSku, totalAmount, isSelf,
                finalRecipientName, finalRecipientEmail, finalRecipientMobile,
                isSelf === 1 ? null : (gift_message || null),
                woohooRefNo, qty, paymentTypeInt,
                `Woohoo error: ${errorReason}`,
                appliedOfferId, discountAmount, cashbackAmount, payableAmount
            ]
        );

        throw {
            message: `Woohoo provider order failed: ${errorReason}. Money was not debited.`,
            code: 'WOOHOO_FAILED',
            statusCode: 424
        };
    }

    // ─── 3. RESOLVE STATUS FROM WOO HOO RESPONSE DATA ─────────────────────────
    const woohooResponseData = woohooResult.data || {};
    const statusStr = (woohooResponseData.status || '').toLowerCase();

    if (statusStr === 'failed' || statusStr === 'cancelled' || statusStr === 'rejected') {
        const errorReason = woohooResponseData.message || woohooResponseData.error || 'Rejected by provider';
        logger.warn(`[Order Flow] Provider rejected order status '${statusStr}': ${errorReason}. Money not debited.`);

        await pool.query(
            `INSERT INTO gift_card_orders 
             (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
              woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, failure_reason,
              offer_id, discount_amount, cashback_amount, payable_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4, ?, 0.00, 0.00, ?, ?, ?, ?, ?, ?)`,
            [
                userId, giftcard_id, orderSku, totalAmount, isSelf,
                finalRecipientName, finalRecipientEmail, finalRecipientMobile,
                isSelf === 1 ? null : (gift_message || null),
                woohooRefNo, qty, paymentTypeInt,
                `Woohoo error: ${errorReason}`,
                appliedOfferId, discountAmount, cashbackAmount, payableAmount
            ]
        );

        throw {
            message: `Woohoo provider order failed: ${errorReason}. Money was not debited.`,
            code: 'WOOHOO_FAILED',
            statusCode: 424
        };
    }

    if (statusStr === 'processing' || statusStr === 'pending') {
        logger.info('[Order Flow] Provider order is processing asynchronously.');
        let orderId;
        await runInTransaction(async (connection) => {
            const deduct = await deductPayment(userId, payableAmount, paymentTypeInt, null, paymentMethodInt, connection);
            const [orderRes] = await connection.query(
                `INSERT INTO gift_card_orders 
                 (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
                  woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, woohoo_order_id, woohoo_response,
                  offer_id, discount_amount, cashback_amount, payable_amount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, giftcard_id, orderSku, totalAmount, isSelf,
                    finalRecipientName, finalRecipientEmail, finalRecipientMobile,
                    isSelf === 1 ? null : (gift_message || null),
                    woohooRefNo, qty, deduct.walletDeducted, deduct.onlineDeducted, paymentTypeInt,
                    woohooResponseData.orderId || null, JSON.stringify(woohooResponseData),
                    appliedOfferId, discountAmount, cashbackAmount, payableAmount
                ]
            );
            orderId = orderRes.insertId;
            if (deduct.walletTransactionId) {
                await connection.query('UPDATE wallet_transactions SET order_id = ? WHERE id = ?', [orderId, deduct.walletTransactionId]);
            }
        });

        logger.info(`[Order Flow] Asynchronous order created for Order #${orderId}. Status: 1 (PROCESSING), Ref: ${woohooRefNo}, Woohoo Order ID: ${woohooResponseData.orderId || 'N/A'}`);
        processConditionalOrderActivation(orderId).catch(err => logger.error('[Order System] Activation flow error:', err.message));

        return {
            success: true,
            message: 'Order is processing asynchronously',
            data: { orderId, woohooOrderId: woohooResponseData.orderId, status: 'PROCESSING' }
        };
    }

    // ─── 4. DIRECT SUCCESS (ORDER COMPLETED) ──────────────────────────────────
    const cards = woohooResponseData.cards || (woohooResponseData.card ? [woohooResponseData.card] : []);

    try {
        let orderId;
        await runInTransaction(async (connection) => {
            const deduct = await deductPayment(userId, payableAmount, paymentTypeInt, null, paymentMethodInt, connection);
            const [orderRes] = await connection.query(
                `INSERT INTO gift_card_orders 
                 (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message,
                  woohoo_reference_no, status, quantity, wallet_amount, online_amount, payment_type, woohoo_order_id, woohoo_response,
                  offer_id, discount_amount, cashback_amount, payable_amount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, giftcard_id, orderSku, totalAmount, isSelf,
                    finalRecipientName, finalRecipientEmail, finalRecipientMobile,
                    isSelf === 1 ? null : (gift_message || null),
                    woohooRefNo, qty, deduct.walletDeducted, deduct.onlineDeducted, paymentTypeInt,
                    woohooResponseData.orderId || null, JSON.stringify(woohooResponseData),
                    appliedOfferId, discountAmount, cashbackAmount, payableAmount
                ]
            );
            orderId = orderRes.insertId;
            if (deduct.walletTransactionId) {
                await connection.query('UPDATE wallet_transactions SET order_id = ? WHERE id = ?', [orderId, deduct.walletTransactionId]);
            }

            if (cards.length > 0) {
                const itemValues = cards.map(c => {
                    const parsedCardId = parseInt(c.cardId || c.card_id || c.id);
                    const cardIdVal = isNaN(parsedCardId) ? null : parsedCardId;
                    return [
                        orderId,
                        cardIdVal,
                        c.sku || orderSku || null,
                        c.productName || c.product_name || c.name || giftCard.gift_card_name || null,
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
        });

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

        sendOrderCompletionEmailByOrderId(orderId).catch(err => logger.error('[Order System] Email notification error:', err));
        processConditionalOrderActivation(orderId).catch(err => logger.error('[Order System] Activation flow error:', err.message));

        return {
            success: true,
            message: 'Order completed successfully',
            data: { orderId, woohooOrderId: woohooResponseData.orderId, status: 'COMPLETED', cards }
        };
    } catch (err) {
        logger.error('[Order Flow] Direct success local save failed:', err);
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
    // 1. Fetch all orders currently in PENDING (0) or PROCESSING (1) state
    const [pendingOrders] = await pool.query(
        `SELECT id, user_id, woohoo_reference_no, cashback_amount, wallet_amount, status, created_at, failure_reason
         FROM gift_card_orders 
         WHERE (status = 0 OR status = 1)
           AND woohoo_reference_no IS NOT NULL`
    );

    if (pendingOrders.length === 0) {
        return;
    }

    logger.info(`[Cron Resolver] Found ${pendingOrders.length} pending/processing orders to resolve.`);

    for (const order of pendingOrders) {
        try {
            logger.info(`[Cron Resolver] Processing resolution for Order #${order.id} (Ref: ${order.woohoo_reference_no})`);
            const actRes = await processConditionalOrderActivation(order.id);
            if (!actRes?.success) {
                const createdAtTime = order.created_at ? new Date(order.created_at).getTime() : Date.now();
                const ageInMinutes = (Date.now() - createdAtTime) / (60 * 1000);
                if (ageInMinutes > 15 && order.status !== 4 && order.status !== 5 && order.status !== 2) {
                    logger.warn(`[Cron Resolver] Order #${order.id} unresolvable after 15m (${ageInMinutes.toFixed(1)}m old). Marking as FAILED and processing refund if applicable.`);
                    
                    await runInTransaction(async (connection) => {
                        // Lock order row to prevent race conditions across concurrent cron runs
                        const [[lockedOrder]] = await connection.query(
                            'SELECT id, status, wallet_amount, user_id FROM gift_card_orders WHERE id = ? FOR UPDATE',
                            [order.id]
                        );

                        if (!lockedOrder || lockedOrder.status === 4 || lockedOrder.status === 5 || lockedOrder.status === 2 || lockedOrder.status === 3) {
                            logger.info(`[Cron Resolver] Order #${order.id} already finalized with status ${lockedOrder?.status}. Skipping.`);
                            return;
                        }

                        // Mark order as permanently FAILED (status = 4)
                        await connection.query(
                            'UPDATE gift_card_orders SET status = 4, failure_reason = ? WHERE id = ?',
                            ['Order resolution unsuccessful after 15 minutes limit', order.id]
                        );

                        // Idempotency check: verify if refund transaction already exists for this order
                        const [[existingRefund]] = await connection.query(
                            'SELECT id FROM wallet_transactions WHERE order_id = ? AND source = ? LIMIT 1',
                            [order.id, WALLET_TRANSACTION_SOURCE.REFUND]
                        );

                        const walletAmount = parseFloat(lockedOrder.wallet_amount) || 0;
                        if (walletAmount > 0 && lockedOrder.user_id && !existingRefund) {
                            await creditWallet(
                                lockedOrder.user_id,
                                walletAmount,
                                WALLET_TRANSACTION_SOURCE.REFUND,
                                order.id,
                                `Refund for failed order #${order.id}`,
                                connection
                            );
                            logger.info(`[Cron Resolver] Refund of ₹${walletAmount} processed for Order #${order.id}`);
                        } else if (existingRefund) {
                            logger.info(`[Cron Resolver] Refund already exists for Order #${order.id}. Skipping duplicate refund.`);
                        }
                    });
                }
            }
        } catch (err) {
            logger.warn(`[Cron Resolver] Error checking Order #${order.id}: ${err.message}. Retrying on next pass...`);
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
              (user_id, gift_card_id, sku, amount, is_self_purchase, recipient_name, recipient_email, recipient_mobile, gift_message, 
               wallet_transaction_id, woohoo_reference_no, woohoo_order_id, status, wallet_amount, online_amount, payment_type, quantity, cashback_amount, payable_amount)
             VALUES (?, ?, ?, ?, 1, null, null, null, null, null, ?, ?, 2, ?, ?, 1, ?, 0.00, ?)`,
            [
                userId,
                giftCardId,
                sku || null,
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

        // Target email: recipient email if provided, else purchaser user email
        const targetEmail = orderRow.recipient_email || user.email;

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

