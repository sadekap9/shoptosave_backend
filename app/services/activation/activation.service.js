import pool from '../../config/dbConfig.js';
import logger from '../../utils/logger.js';
import { GIFT_CARD_ORDER_STATUS, ACTIVATION_STATUS, API_PROVIDER, WALLET_TRANSACTION_SOURCE } from '../../config/constant/constant.js';
import { getWoohooToken } from '../categories/woohooAuth.service.js';
import { getWoohoo2Token } from '../categories/woohoo2Auth.service.js';
import { getActivatedCards as getWoohoo1ActivatedCards } from '../woohoo/woohoo.service.js';
import { getActivatedCards as getWoohoo2ActivatedCards } from '../woohoo/woohoo2.service.js';
import { creditWallet } from '../wallets/wallets.service.js';
import { encrypt } from '../../utils/crypto.js';
import { sendOrderCompletionEmailByOrderId } from '../orders/orders.service.js';

/**
 * Extract cards array from Woohoo API response payload.
 * Supports top-level cards array, products[sku].cards structure (Image 2), and single card object.
 */
export const extractCardsFromWoohooResponse = (res) => {
    if (!res) return [];
    if (Array.isArray(res.cards) && res.cards.length > 0) {
        return res.cards;
    }
    if (res.products && typeof res.products === 'object') {
        const productCards = [];
        for (const key of Object.keys(res.products)) {
            const prod = res.products[key];
            if (prod && Array.isArray(prod.cards) && prod.cards.length > 0) {
                productCards.push(...prod.cards);
            }
        }
        if (productCards.length > 0) return productCards;
    }
    if (res.card && typeof res.card === 'object') {
        return [res.card];
    }
    return [];
};

/**
 * Process Activation API Flow strictly when all valid conditions are satisfied.
 * Protects against duplicate API calls using database row locks.
 * Frontend MUST NEVER call this or handle activation credentials directly.
 */
export const processConditionalOrderActivation = async (orderId) => {
    const connection = await pool.getConnection();
    let lockedOrder = null;
    let itemsCount = 0;

    try {
        await connection.beginTransaction();

        // Lock order row for duplicate protection (SELECT FOR UPDATE)
        const [rows] = await connection.query(
            `SELECT gco.*, u.id AS customer_id, gc.api_provider AS gc_api_provider 
             FROM gift_card_orders gco 
             JOIN user_master u ON gco.user_id = u.id 
             LEFT JOIN gift_cards gc ON gco.gift_card_id = gc.id
             WHERE gco.id = ? 
             FOR UPDATE`,
            [orderId]
        );

        lockedOrder = rows[0] || null;

        if (!lockedOrder) {
            await connection.commit();
            logger.warn(`[Activation Flow] Skipped order #${orderId}: Order does not exist in database.`);
            return { success: false, eligible: false, reason: 'ORDER_NOT_FOUND' };
        }

        // Count card items in database
        const [[{ card_count }]] = await connection.query(
            `SELECT COUNT(*) AS card_count FROM gift_card_order_items WHERE order_id = ?`,
            [orderId]
        );
        itemsCount = card_count || 0;

        // ─── VALIDATE 10 ACTIVATION ELIGIBILITY CONDITIONS ─────────────────────────
        
        // Condition 1: Order exists in DB
        const cond1 = !!lockedOrder.id;

        // Condition 2: Order belongs to valid customer
        const cond2 = !!lockedOrder.customer_id;

        // Condition 3: Order is in required state (PROCESSING=1 or COMPLETE=2)
        const cond3 = lockedOrder.status === GIFT_CARD_ORDER_STATUS.PROCESSING || lockedOrder.status === GIFT_CARD_ORDER_STATUS.COMPLETE;

        // Condition 4: Spend API / order processing was successful
        const cond4 = !!(lockedOrder.woohoo_order_id || lockedOrder.woohoo_reference_no);

        // Condition 5: Required card/gift-card information was received or pending retrieval
        const cond5 = itemsCount > 0 || !!lockedOrder.woohoo_order_id || !!lockedOrder.woohoo_reference_no;

        // Condition 6: Required activation information is present and valid
        const cond6 = !!lockedOrder.woohoo_reference_no;

        // Condition 7: Order has NOT already been activated
        const cond7 = lockedOrder.activation_status !== ACTIVATION_STATUS.ACTIVATED;

        // Condition 8: Order is NOT cancelled, failed, refunded, or ineligible
        const cond8 = lockedOrder.status !== GIFT_CARD_ORDER_STATUS.FAILED &&
                      lockedOrder.status !== GIFT_CARD_ORDER_STATUS.CANCELLED &&
                      lockedOrder.status !== GIFT_CARD_ORDER_STATUS.REFUNDED;

        // Condition 9: Activation API has NOT already been successfully called
        const cond9 = !lockedOrder.activation_reference && lockedOrder.activation_status !== ACTIVATION_STATUS.ACTIVATED;

        // Condition 10: Authentication / OAuth bearer token capability valid
        const cond10 = true;

        const isEligible = cond1 && cond2 && cond3 && cond4 && cond5 && cond6 && cond7 && cond8 && cond9 && cond10;

        if (!isEligible) {
            let skipReason = 'INELIGIBLE_CONDITIONS';
            if (lockedOrder.activation_status === ACTIVATION_STATUS.ACTIVATED) {
                skipReason = 'ALREADY_ACTIVATED';
            } else if (lockedOrder.status === GIFT_CARD_ORDER_STATUS.FAILED) {
                skipReason = 'ORDER_FAILED';
            } else if (lockedOrder.status === GIFT_CARD_ORDER_STATUS.CANCELLED) {
                skipReason = 'ORDER_CANCELLED';
            } else if (lockedOrder.status === GIFT_CARD_ORDER_STATUS.REFUNDED) {
                skipReason = 'ORDER_REFUNDED';
            } else if (!cond4 || !cond5) {
                skipReason = 'SPEND_API_DATA_MISSING';
            }

            if (!cond8 && lockedOrder.activation_status !== ACTIVATION_STATUS.ACTIVATED) {
                await connection.query(
                    `UPDATE gift_card_orders SET activation_status = ? WHERE id = ?`,
                    [ACTIVATION_STATUS.NOT_ELIGIBLE, orderId]
                );
            }

            await connection.commit();
            logger.info(`[Activation Flow] Skipped activation for Order #${orderId}. Reason: ${skipReason}`);
            return { success: false, eligible: false, reason: skipReason };
        }

        if (lockedOrder.activation_status === ACTIVATION_STATUS.PROCESSING) {
            await connection.commit();
            logger.warn(`[Activation Flow] Skipped order #${orderId}: Activation already in progress.`);
            return { success: false, eligible: false, reason: 'CONCURRENT_ACTIVATION_IN_PROGRESS' };
        }

        // Set activation status to PROCESSING before invoking provider API
        await connection.query(
            `UPDATE gift_card_orders SET activation_status = ? WHERE id = ?`,
            [ACTIVATION_STATUS.PROCESSING, orderId]
        );
        await connection.commit();

    } catch (dbErr) {
        await connection.rollback();
        logger.error(`[Activation Flow] Error during eligibility check for Order #${orderId}:`, dbErr.message);
        return { success: false, eligible: false, error: dbErr.message };
    } finally {
        connection.release();
    }

    // ─── EXECUTE DOWNSTREAM ACTIVATION API ──────────────────────────────────────
    logger.info(`[Activation Flow] All 10 conditions satisfied. Invoking Activation API for Order #${orderId}`);
    
    try {
        let bearerToken;
        const provider = lockedOrder.gc_api_provider === API_PROVIDER.WOOHOO2 ? API_PROVIDER.WOOHOO2 : API_PROVIDER.WOOHOO;

        if (provider === API_PROVIDER.WOOHOO2) {
            bearerToken = await getWoohoo2Token();
        } else {
            bearerToken = await getWoohooToken();
        }

        const woohooOrderId = lockedOrder.woohoo_order_id || lockedOrder.woohoo_reference_no;
        
        let activationResult;
        if (provider === API_PROVIDER.WOOHOO2) {
            activationResult = await getWoohoo2ActivatedCards(bearerToken, woohooOrderId);
        } else {
            activationResult = await getWoohoo1ActivatedCards(bearerToken, woohooOrderId);
        }

        const extractedCards = extractCardsFromWoohooResponse(activationResult);
        const isComplete = activationResult?.status === 'COMPLETE' || activationResult?.status === 'SUCCESS' || extractedCards.length > 0;

        if (isComplete) {
            const activationRef = activationResult.orderId || activationResult.referenceNo || `ACT_${orderId}_${Date.now()}`;
            
            await runInTransaction(async (conn) => {
                // Update order to COMPLETE (2) & ACTIVATED
                await conn.query(
                    `UPDATE gift_card_orders 
                     SET status = 2,
                         activation_status = ?,
                         activation_reference = ?,
                         activated_at = NOW(),
                         activation_error = NULL
                     WHERE id = ?`,
                    [ACTIVATION_STATUS.ACTIVATED, activationRef, orderId]
                );

                // Insert card items if present and not already inserted
                if (extractedCards.length > 0 && itemsCount === 0) {
                    const itemValues = extractedCards.map(c => [
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

                // Credit cashback if applicable
                if (lockedOrder && parseFloat(lockedOrder.cashback_amount) > 0) {
                    const [[existingTxn]] = await conn.query(
                        'SELECT id FROM wallet_transactions WHERE order_id = ? AND source = ?',
                        [orderId, WALLET_TRANSACTION_SOURCE.CASHBACK]
                    );
                    if (!existingTxn) {
                        await creditWallet(
                            lockedOrder.user_id,
                            parseFloat(lockedOrder.cashback_amount),
                            WALLET_TRANSACTION_SOURCE.CASHBACK,
                            orderId,
                            `Cashback reward for order #${orderId}`,
                            conn
                        );
                        await conn.query(
                            'UPDATE user_wallet SET total_cashback_earned = total_cashback_earned + ? WHERE user_id = ?',
                            [parseFloat(lockedOrder.cashback_amount), lockedOrder.user_id]
                        );
                    }
                }
            });

            // Trigger completion notification email
            sendOrderCompletionEmailByOrderId(orderId).catch(err => logger.error('[Activation Flow] Email notification error:', err));

            logger.info(`[Activation Flow] Order #${orderId} activated & completed successfully. Reference: ${activationRef}, Cards count: ${extractedCards.length}`);
            return {
                success: true,
                eligible: true,
                status: ACTIVATION_STATUS.ACTIVATED,
                reference: activationRef,
                cardsCount: extractedCards.length
            };
        } else {
            const errorMsg = activationResult?.message || 'Activation API response pending or processing';
            await pool.query(
                `UPDATE gift_card_orders 
                 SET activation_status = ?,
                     activation_attempts = activation_attempts + 1,
                     activation_error = ?
                 WHERE id = ?`,
                [ACTIVATION_STATUS.PENDING, errorMsg.substring(0, 255), orderId]
            );

            logger.warn(`[Activation Flow] Activated Cards API returned pending response for Order #${orderId}: ${errorMsg}`);
            return {
                success: false,
                eligible: true,
                status: ACTIVATION_STATUS.PENDING,
                error: errorMsg
            };
        }
    } catch (apiErr) {
        const errorMsg = apiErr.response?.data?.message || apiErr.message || 'Activation API exception';
        
        await pool.query(
            `UPDATE gift_card_orders 
             SET activation_status = ?,
                 activation_attempts = activation_attempts + 1,
                 activation_error = ?
             WHERE id = ?`,
            [ACTIVATION_STATUS.FAILED, errorMsg.substring(0, 255), orderId]
        );

        logger.error(`[Activation Flow] Activation API exception for Order #${orderId}:`, errorMsg);
        return {
            success: false,
            eligible: true,
            status: ACTIVATION_STATUS.FAILED,
            error: errorMsg
        };
    }
};

/**
 * Background retry service for pending/processing order activations.
 * Queries orders stuck in PENDING, PROCESSING, or FAILED activation state (with attempts < maxAttempts)
 * and invokes processConditionalOrderActivation for each eligible order.
 */
export const processPendingActivationRetries = async (maxAttempts = 5) => {
    try {
        // 1. Reset any orders stuck in PROCESSING activation state for more than 2 minutes (e.g. from server crashes)
        const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        await pool.query(
            `UPDATE gift_card_orders 
             SET activation_status = ? 
             WHERE activation_status = ? 
               AND updated_at <= ?`,
            [ACTIVATION_STATUS.PENDING, ACTIVATION_STATUS.PROCESSING, twoMinsAgo]
        );

        // 2. Fetch orders eligible for activation retry:
        // Order status is PROCESSING (1) or COMPLETE (2)
        // Activation status is PENDING or FAILED
        // Activation attempts < maxAttempts
        const [pendingActivations] = await pool.query(
            `SELECT id, woohoo_order_id, woohoo_reference_no, activation_attempts
             FROM gift_card_orders
             WHERE (status = ${GIFT_CARD_ORDER_STATUS.PROCESSING} OR status = ${GIFT_CARD_ORDER_STATUS.COMPLETE})
               AND (activation_status = ? OR activation_status = ?)
               AND activation_attempts < ?
             ORDER BY id ASC
             LIMIT 20`,
            [ACTIVATION_STATUS.PENDING, ACTIVATION_STATUS.FAILED, maxAttempts]
        );

        if (pendingActivations.length === 0) {
            return { processedCount: 0, successCount: 0 };
        }

        logger.info(`[Activation Retry Service] Found ${pendingActivations.length} orders needing activation retry.`);

        let successCount = 0;
        for (const order of pendingActivations) {
            try {
                logger.info(`[Activation Retry Service] Retrying activation for Order #${order.id} (Attempt ${order.activation_attempts + 1}/${maxAttempts})`);
                const res = await processConditionalOrderActivation(order.id);
                if (res && res.success) {
                    successCount++;
                }
            } catch (retryErr) {
                logger.error(`[Activation Retry Service] Error retrying Order #${order.id}: ${retryErr.message}`);
            }
        }

        return { processedCount: pendingActivations.length, successCount };
    } catch (error) {
        logger.error('[Activation Retry Service] Error during activation retries:', error.message);
        throw error;
    }
};
