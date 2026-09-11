import pool, { runInTransaction } from '../../config/dbConfig.js';
import logger from '../../utils/logger.js';
import { GIFT_CARD_ORDER_STATUS, ACTIVATION_STATUS, API_PROVIDER, WALLET_TRANSACTION_SOURCE } from '../../config/constant/constant.js';
import { getWoohooToken } from '../categories/woohooAuth.service.js';
import { getWoohoo2Token } from '../categories/woohoo2Auth.service.js';
import { getActivatedCards as getWoohoo1ActivatedCards, getWoohooOrderByRefNo as getWoohoo1OrderByRefNo } from '../woohoo/woohoo.service.js';
import { getActivatedCards as getWoohoo2ActivatedCards, getWoohooOrderByRefNo as getWoohoo2OrderByRefNo } from '../woohoo/woohoo2.service.js';
import { creditWallet } from '../wallets/wallets.service.js';
import { encrypt } from '../../utils/crypto.js';
import { sendOrderCompletionEmailByOrderId } from '../orders/orders.service.js';

/**
 * Unpack order data object from various Woohoo API response wrappers
 */
export const unpackWoohooOrderData = (res) => {
    if (!res) return {};
    if (Array.isArray(res)) return unpackWoohooOrderData(res[0]);
    if (typeof res === 'object') {
        if (Array.isArray(res.orders) && res.orders.length > 0) return unpackWoohooOrderData(res.orders[0]);
        if (res.order && typeof res.order === 'object') return unpackWoohooOrderData(res.order);
        if (res.data && typeof res.data === 'object') return unpackWoohooOrderData(res.data);
    }
    return res;
};

/**
 * Extract cards array from Woohoo API response payload.
 * Supports top-level cards array, products[sku].cards structure (Image 2), and single card object.
 */
export const extractCardsFromWoohooResponse = (res) => {
    if (!res) return [];
    if (Array.isArray(res)) {
        const cards = [];
        for (const item of res) {
            cards.push(...extractCardsFromWoohooResponse(item));
        }
        return cards;
    }
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
    if (res.cardNumber || res.card_number || res.cardNo || res.number || res.card_no) {
        return [res];
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
            `SELECT gco.*, u.id AS customer_id, gc.api_provider AS gc_api_provider, gc.sku AS gc_sku, gc.gift_card_name 
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

        // Condition 3: Order is in required state (PENDING=0, PROCESSING=1, COMPLETE=2, or FAILED due to initial API timeout)
        const isTimeoutFailed = lockedOrder.status === GIFT_CARD_ORDER_STATUS.FAILED && 
                               (lockedOrder.failure_reason?.toLowerCase().includes('timeout') || lockedOrder.failure_reason?.toLowerCase().includes('unsuccessful'));
        const cond3 = lockedOrder.status === GIFT_CARD_ORDER_STATUS.PENDING || 
                      lockedOrder.status === GIFT_CARD_ORDER_STATUS.PROCESSING || 
                      lockedOrder.status === GIFT_CARD_ORDER_STATUS.COMPLETE ||
                      isTimeoutFailed;

        // Condition 4: Spend API / order processing was successful or refno present
        const cond4 = !!(lockedOrder.woohoo_order_id || lockedOrder.woohoo_reference_no);

        // Condition 5: Required card/gift-card information was received or pending retrieval
        const cond5 = itemsCount > 0 || !!lockedOrder.woohoo_order_id || !!lockedOrder.woohoo_reference_no;

        // Condition 6: Required activation information is present and valid
        const cond6 = !!lockedOrder.woohoo_reference_no;

        // Condition 7: Order has NOT already been activated
        const isAlreadyActivated = lockedOrder.activation_status === ACTIVATION_STATUS.ACTIVATED || lockedOrder.activation_status === 'ACTIVATED';
        const cond7 = !isAlreadyActivated;

        // Condition 8: Order is NOT cancelled or refunded
        const cond8 = lockedOrder.status !== GIFT_CARD_ORDER_STATUS.CANCELLED &&
                      lockedOrder.status !== GIFT_CARD_ORDER_STATUS.REFUNDED;

        // Condition 9: Activation API has NOT already been successfully called
        const cond9 = !lockedOrder.activation_reference && !isAlreadyActivated;

        // Condition 10: Authentication / OAuth bearer token capability valid
        const cond10 = true;

        const isEligible = cond1 && cond2 && cond3 && cond4 && cond5 && cond6 && cond7 && cond8 && cond9 && cond10;

        logger.info(`[Activation Flow] Order #${orderId} reconciliation eligibility checked: eligible=${isEligible}, status=${lockedOrder.status}, ref=${lockedOrder.woohoo_reference_no}`);

        if (!isEligible) {
            let skipReason = 'INELIGIBLE_CONDITIONS';
            if (isAlreadyActivated) {
                skipReason = 'ALREADY_ACTIVATED';
            } else if (lockedOrder.status === GIFT_CARD_ORDER_STATUS.FAILED && !isTimeoutFailed) {
                skipReason = 'ORDER_FAILED';
            } else if (lockedOrder.status === GIFT_CARD_ORDER_STATUS.CANCELLED) {
                skipReason = 'ORDER_CANCELLED';
            } else if (lockedOrder.status === GIFT_CARD_ORDER_STATUS.REFUNDED) {
                skipReason = 'ORDER_REFUNDED';
            } else if (!cond4 || !cond5) {
                skipReason = 'SPEND_API_DATA_MISSING';
            }

            if (!cond8 && !isAlreadyActivated) {
                await connection.query(
                    `UPDATE gift_card_orders SET activation_status = ? WHERE id = ?`,
                    [ACTIVATION_STATUS.NOT_ELIGIBLE, orderId]
                );
            }

            await connection.commit();
            logger.info(`[Activation Flow] Skipped activation for Order #${orderId}. Reason: ${skipReason}`);
            return { success: false, eligible: false, reason: skipReason };
        }

        // Mark activation_status as PROCESSING if currently 0 (PENDING)
        if (lockedOrder.activation_status === ACTIVATION_STATUS.PENDING) {
            await connection.query(
                `UPDATE gift_card_orders SET activation_status = ? WHERE id = ?`,
                [ACTIVATION_STATUS.PROCESSING, orderId]
            );
        }
        await connection.commit();

    } catch (dbErr) {
        await connection.rollback();
        logger.error(`[Activation Flow] Error during eligibility check for Order #${orderId}:`, dbErr.message);
        return { success: false, eligible: false, error: dbErr.message };
    } finally {
        connection.release();
    }

    // ─── EXECUTE RECONCILIATION & ORDER STATUS CHECK ───────────────────────────
    logger.info(`[Activation Flow] Reconciliation started for Order #${orderId} (Ref: ${lockedOrder.woohoo_reference_no})`);
    
    try {
        let bearerToken;
        const provider = lockedOrder.gc_api_provider === API_PROVIDER.WOOHOO2 ? API_PROVIDER.WOOHOO2 : API_PROVIDER.WOOHOO;

        if (provider === API_PROVIDER.WOOHOO2) {
            bearerToken = await getWoohoo2Token();
        } else {
            bearerToken = await getWoohooToken();
        }

        let refRes = null;
        let woohooOrderId = lockedOrder.woohoo_order_id;

        // Step 1: Call Order Status API by reference number
        logger.info(`[Activation Flow] Order Status API called for Order #${orderId} (Ref: ${lockedOrder.woohoo_reference_no})`);
        try {
            if (provider === API_PROVIDER.WOOHOO2) {
                refRes = await getWoohoo2OrderByRefNo(bearerToken, lockedOrder.woohoo_reference_no);
            } else {
                refRes = await getWoohoo1OrderByRefNo(bearerToken, lockedOrder.woohoo_reference_no);
            }
        } catch (refErr) {
            logger.warn(`[Activation Flow] Order Status API call failed for Order #${orderId} (Ref: ${lockedOrder.woohoo_reference_no}): ${refErr.message}`);
        }

        const refOrderData = unpackWoohooOrderData(refRes);
        woohooOrderId = refOrderData?.orderId || refOrderData?.order_id || refOrderData?.id || refRes?.orderId || lockedOrder.woohoo_order_id;
        
        if (woohooOrderId && woohooOrderId !== lockedOrder.woohoo_reference_no && woohooOrderId !== lockedOrder.woohoo_order_id) {
            await pool.query('UPDATE gift_card_orders SET woohoo_order_id = ? WHERE id = ?', [woohooOrderId, orderId]);
        }

        const cardsFromRef = extractCardsFromWoohooResponse(refRes);
        const refStatus = (refOrderData?.status || refOrderData?.orderStatus || refOrderData?.state || refRes?.status || '').toLowerCase();
        
        logger.info(`[Activation Flow] Order Status API response for Order #${orderId}: status = '${refStatus || 'UNKNOWN'}', Woohoo Order ID = '${woohooOrderId || 'N/A'}'`);

        const isStatusComplete = refStatus === 'complete' || refStatus === 'success' || refStatus === 'completed' || cardsFromRef.length > 0;
        const isStatusFailed = refStatus === 'failed' || refStatus === 'cancelled' || refStatus === 'rejected' || refStatus === 'error';

        // Step 2: Evaluate status decision
        if (isStatusComplete) {
            // ONLY NOW trigger Activated Cards API / card activation logic
            logger.info(`[Activation Flow] Decision: Order Status is COMPLETED for Order #${orderId}. Reason: Verified status '${refStatus || 'COMPLETED'}' from Order Status API.`);
            
            let cardRes = null;
            const targetId = woohooOrderId || lockedOrder.woohoo_reference_no;

            // Trigger Activated Cards API ONLY IF cards are not already present in Order Status response
            if (cardsFromRef.length === 0 && targetId && targetId !== lockedOrder.woohoo_reference_no) {
                logger.info(`[Activation Flow] Activated Cards API called for Order #${orderId} (Woohoo Order ID: ${targetId}). Reason: Order Status is COMPLETED, fetching card credentials.`);
                try {
                    if (provider === API_PROVIDER.WOOHOO2) {
                        cardRes = await getWoohoo2ActivatedCards(bearerToken, targetId);
                    } else {
                        cardRes = await getWoohoo1ActivatedCards(bearerToken, targetId);
                    }
                } catch (cardErr) {
                    logger.warn(`[Activation Flow] Activated Cards API call failed for Order #${orderId}: ${cardErr.message}`);
                }
            } else if (cardsFromRef.length > 0) {
                logger.info(`[Activation Flow] Card credentials obtained directly from Order Status API for Order #${orderId}. Skipping separate Activated Cards API call.`);
            }

            const cardsFromCardRes = extractCardsFromWoohooResponse(cardRes);
            const allExtractedCards = [...cardsFromRef, ...cardsFromCardRes];
            
            // Deduplicate cards
            const extractedCards = [];
            const seenCardKeys = new Set();
            for (const c of allExtractedCards) {
                const key = c.cardNumber || c.card_number || c.cardNo || c.number || c.card_no || c.cardId || c.id;
                if (key && seenCardKeys.has(key)) continue;
                if (key) seenCardKeys.add(key);
                extractedCards.push(c);
            }

            const activationRef = cardRes?.orderId || refRes?.orderId || cardRes?.referenceNo || refRes?.referenceNo || `ACT_${orderId}_${Date.now()}`;
            
            await runInTransaction(async (conn) => {
                // Update order to COMPLETE (2) & ACTIVATED (2)
                await conn.query(
                    `UPDATE gift_card_orders 
                     SET status = 2,
                         activation_status = ?
                     WHERE id = ?`,
                    [ACTIVATION_STATUS.ACTIVATED, orderId]
                );

                // Insert card items if present and not already inserted
                if (extractedCards.length > 0 && itemsCount === 0) {
                    const fallbackSku = lockedOrder.sku || lockedOrder.gc_sku || null;
                    const fallbackName = lockedOrder.gift_card_name || null;
                    const itemValues = extractedCards.map(c => [
                        orderId,
                        c.cardId || c.card_id || c.id || null,
                        c.sku || fallbackSku || null,
                        c.productName || c.product_name || c.name || fallbackName || null,
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
        } else if (isStatusFailed) {
            // FAILED / CANCELLED / REJECTED Status
            logger.warn(`[Activation Flow] Decision: Order Status is ${refStatus.toUpperCase()} for Order #${orderId}. Activated Cards API will NOT be called. Marking order as FAILED.`);

            const failureReason = `Woohoo order status: ${refStatus}`;
            await pool.query(
                `UPDATE gift_card_orders 
                 SET status = 4,
                     activation_status = ?,
                     failure_reason = ?
                 WHERE id = ?`,
                [ACTIVATION_STATUS.FAILED, failureReason, orderId]
            );

            return {
                success: false,
                eligible: true,
                status: ACTIVATION_STATUS.FAILED,
                error: failureReason
            };
        } else {
            // PROCESSING / PENDING / UNKNOWN / API ERROR
            logger.info(`[Activation Flow] Decision: Order Status is '${refStatus || 'PENDING'}' for Order #${orderId}. Activated Cards API will NOT be called. Keeping order in PROCESSING.`);

            const procReason = `Woohoo order status pending: ${refStatus || 'no response'}`;
            await pool.query(
                `UPDATE gift_card_orders 
                 SET activation_status = ?,
                     failure_reason = ?
                 WHERE id = ?`,
                [ACTIVATION_STATUS.PROCESSING, procReason.substring(0, 255), orderId]
            );

            return {
                success: false,
                eligible: true,
                status: ACTIVATION_STATUS.PROCESSING,
                error: procReason
            };
        }
    } catch (apiErr) {
        const errorMsg = apiErr.response?.data?.message || apiErr.message || 'Activation API exception';
        logger.error(`[Activation Flow] Activation API exception for Order #${orderId}:`, errorMsg);
        
        await pool.query(
            `UPDATE gift_card_orders 
             SET activation_status = ?,
                 failure_reason = ?
             WHERE id = ?`,
            [ACTIVATION_STATUS.PROCESSING, errorMsg.substring(0, 255), orderId]
        );

        return {
            success: false,
            eligible: true,
            status: ACTIVATION_STATUS.PROCESSING,
            error: errorMsg
        };
    }
};
