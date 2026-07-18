import pool from '../../config/dbConfig.js';
import logger from '../../utils/logger.js';
import { OFFER_STATUS, OFFER_USAGE_STATUS, OFFER_TYPE, VALUE_TYPE, GIFT_CARD_ORDER_STATUS } from '../../config/constant/constant.js';

/**
 * Helper to check date boundaries
 */
const isCurrentDateWithinRange = (start, end) => {
    const now = new Date();
    return new Date(start) <= now && now <= new Date(end);
};
/**
 * Helper to check duplicate active offers by target scope (gift_card_id, store_id, global)
 */
const checkDuplicateOffer = async (offerData, excludeId = null) => {
    const status = offerData.status !== undefined ? Number(offerData.status) : OFFER_STATUS.ACTIVE;
    if (status !== OFFER_STATUS.ACTIVE) {
        return null;
    }

    const { offer_name, store_id, gift_card_id } = offerData;

    if (offer_name) {
        let nameSql = `SELECT id FROM offers WHERE offer_name = ? AND status = ${OFFER_STATUS.ACTIVE}`;
        const nameParams = [offer_name];

        if (gift_card_id) {
            nameSql += ` AND gift_card_id = ?`;
            nameParams.push(Number(gift_card_id));
        } else if (store_id) {
            nameSql += ` AND store_id = ? AND (gift_card_id IS NULL OR gift_card_id = 0)`;
            nameParams.push(Number(store_id));
        } else {
            nameSql += ` AND (store_id IS NULL OR store_id = 0) AND (gift_card_id IS NULL OR gift_card_id = 0)`;
        }

        if (excludeId) {
            nameSql += ` AND id != ?`;
            nameParams.push(excludeId);
        }

        const [[existingName]] = await pool.query(nameSql, nameParams);
        if (existingName) {
            let scopeLabel = 'all stores (global)';
            if (gift_card_id) scopeLabel = 'this specific gift card';
            else if (store_id) scopeLabel = 'this specific store';
            return `An active offer with the name '${offer_name}' already exists for ${scopeLabel}.`;
        }
    }

    return null;
};

const normalizeOfferType = (type) => {
    if (type === 'instant_discount' || type === OFFER_TYPE.INSTANT_DISCOUNT || type === String(OFFER_TYPE.INSTANT_DISCOUNT)) return OFFER_TYPE.INSTANT_DISCOUNT;
    if (type === 'cashback' || type === OFFER_TYPE.CASHBACK || type === String(OFFER_TYPE.CASHBACK)) return OFFER_TYPE.CASHBACK;
    return Number(type);
};

/**
 * Helper to resolve the applicable offer for a specific gift card.
 * Priority: 1. Active gift-card-specific offer, 2. Active store-level offer.
 */
export const getApplicableOffer = async (giftCardId, connection = null) => {
    const db = connection || pool;
    if (!giftCardId) return null;

    const [[gc]] = await db.query(
        'SELECT id, store_id FROM gift_cards WHERE id = ?',
        [giftCardId]
    );
    if (!gc) return null;

    // 1. Check active gift-card-specific offer
    const [cardOffers] = await db.query(
        `SELECT id, offer_name, offer_type, value_type, value, store_id, gift_card_id, 
                min_order_amount, max_discount, start_date, end_date
         FROM offers
         WHERE status = ${OFFER_STATUS.ACTIVE}
           AND gift_card_id = ?
           AND start_date <= NOW()
           AND end_date >= NOW()
         ORDER BY id DESC LIMIT 1`,
        [giftCardId]
    );

    let selectedOffer = cardOffers[0] || null;

    // 2. If none exists, check active store-level offer
    if (!selectedOffer && gc.store_id) {
        const [storeOffers] = await db.query(
            `SELECT id, offer_name, offer_type, value_type, value, store_id, gift_card_id, 
                    min_order_amount, max_discount, start_date, end_date
             FROM offers
             WHERE status = ${OFFER_STATUS.ACTIVE}
               AND store_id = ?
               AND (gift_card_id IS NULL OR gift_card_id = 0)
               AND start_date <= NOW()
               AND end_date >= NOW()
             ORDER BY id DESC LIMIT 1`,
            [gc.store_id]
        );
        selectedOffer = storeOffers[0] || null;
    }

    if (!selectedOffer) return null;

    const offerTypeNum = Number(selectedOffer.offer_type);
    const valueTypeNum = Number(selectedOffer.value_type);
    const valNum = parseFloat(selectedOffer.value);

    let display_text = '';
    if (offerTypeNum === OFFER_TYPE.INSTANT_DISCOUNT) {
        display_text = valueTypeNum === VALUE_TYPE.PERCENTAGE ? `${valNum}% OFF` : `₹${valNum} OFF`;
    } else if (offerTypeNum === OFFER_TYPE.CASHBACK) {
        display_text = valueTypeNum === VALUE_TYPE.PERCENTAGE ? `${valNum}% Cashback` : `₹${valNum} Cashback`;
    }

    return {
        id: selectedOffer.id,
        offer_name: selectedOffer.offer_name,
        offer_type: offerTypeNum,
        value_type: valueTypeNum,
        value: valNum,
        display_text,
        store_id: selectedOffer.store_id,
        gift_card_id: selectedOffer.gift_card_id,
        min_order_amount: selectedOffer.min_order_amount ? parseFloat(selectedOffer.min_order_amount) : 0,
        max_discount: selectedOffer.max_discount ? parseFloat(selectedOffer.max_discount) : null
    };
};

/**
 * Create an offer
 */
export const createOfferService = async (payload) => {
    try {
        const normalizedOfferType = normalizeOfferType(payload.offer_type);
        const finalValue = parseFloat(payload.value);
        const finalValueType = payload.value_type || VALUE_TYPE.PERCENTAGE;

        const normalizedPayload = {
            offer_name: payload.offer_name,
            offer_type: normalizedOfferType,
            store_id: payload.store_id || null,
            gift_card_id: payload.gift_card_id || null,
            value_type: finalValueType,
            value: finalValue,
            min_order_amount: payload.min_order_amount !== undefined ? parseFloat(payload.min_order_amount) : 0.00,
            max_discount: payload.max_discount ? parseFloat(payload.max_discount) : null,
            total_usage_limit: payload.total_usage_limit ? parseInt(payload.total_usage_limit) : null,
            per_user_limit: payload.per_user_limit ? parseInt(payload.per_user_limit) : null,
            unique_users_only: payload.unique_users_only ? Number(payload.unique_users_only) : 0,
            start_date: payload.start_date,
            end_date: payload.end_date,
            status: payload.status !== undefined ? Number(payload.status) : 1
        };

        // Scope-based duplicate check
        const dupError = await checkDuplicateOffer(normalizedPayload);
        if (dupError) {
            return {
                success: false,
                statusCode: 400,
                message: dupError
            };
        }

        const [result] = await pool.query(
            `INSERT INTO offers 
             (offer_name, offer_type, store_id, gift_card_id, value_type, value, min_order_amount, max_discount, total_usage_limit, per_user_limit, unique_users_only, start_date, end_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                normalizedPayload.offer_name, normalizedPayload.offer_type, normalizedPayload.store_id, normalizedPayload.gift_card_id,
                normalizedPayload.value_type, normalizedPayload.value, normalizedPayload.min_order_amount, normalizedPayload.max_discount,
                normalizedPayload.total_usage_limit, normalizedPayload.per_user_limit, normalizedPayload.unique_users_only,
                normalizedPayload.start_date, normalizedPayload.end_date, normalizedPayload.status
            ]
        );

        return {
            success: true,
            statusCode: 200,
            message: 'Offer created successfully',
            data: { id: result.insertId }
        };
    } catch (error) {
        logger.error('Error in createOfferService', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Get all offers (with pagination & filters)
 */
export const getOffersService = async (filters = {}) => {
    try {
        const { page = 1, limit = 10, search, offer_type, status } = filters;
        const pageVal = parseInt(page);
        const limitVal = parseInt(limit);
        const offset = (pageVal - 1) * limitVal;

        let countSql = `
            SELECT COUNT(*) AS total 
            FROM offers o
            LEFT JOIN stores s ON o.store_id = s.id
            LEFT JOIN gift_cards gc ON o.gift_card_id = gc.id
            WHERE 1=1
        `;
        let querySql = `
            SELECT o.*, s.store_name, gc.gift_card_name 
            FROM offers o
            LEFT JOIN stores s ON o.store_id = s.id
            LEFT JOIN gift_cards gc ON o.gift_card_id = gc.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            countSql += ` AND o.offer_name LIKE ?`;
            querySql += ` AND o.offer_name LIKE ?`;
            params.push(`%${search}%`);
        }

        if (offer_type !== undefined && offer_type !== null && offer_type !== '' && offer_type !== 'All') {
            countSql += ' AND o.offer_type = ?';
            querySql += ' AND o.offer_type = ?';
            params.push(parseInt(offer_type));
        }

        if (status !== undefined && status !== null && status !== '' && status !== 'All') {
            countSql += ' AND o.status = ?';
            querySql += ' AND o.status = ?';
            params.push(parseInt(status));
        }

        querySql += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
        const queryParams = [...params, limitVal, offset];

        const [totalResult, rowsResult, statsResult] = await Promise.all([
            pool.query(countSql, params),
            pool.query(querySql, queryParams),
            pool.query(`
                SELECT 
                    COUNT(*) AS total,
                    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS active,
                    SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS inactive
                FROM offers
            `)
        ]);

        const [[{ total }]] = totalResult;
        const [offers] = rowsResult;
        const [[stats]] = statsResult;

        // Sanitize offers to remove created_at and updated_at
        const sanitizedOffers = offers.map(o => {
            const { created_at, updated_at, ...rest } = o;
            return rest;
        });

        return {
            success: true,
            statusCode: 200,
            message: 'Offers fetched successfully',
            data: sanitizedOffers,
            pagination: {
                total,
                page: pageVal,
                limit: limitVal,
                totalPages: Math.ceil(total / limitVal)
            },
            statistics: {
                total: Number(stats.total) || 0,
                active: Number(stats.active) || 0,
                inactive: Number(stats.inactive) || 0
            }
        };
    } catch (error) {
        logger.error('Error in getOffersService', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Get offer details by ID
 */
export const getOfferByIdService = async (id) => {
    try {
        const [[offer]] = await pool.query('SELECT * FROM offers WHERE id = ?', [id]);
        if (!offer) {
            return {
                success: false,
                statusCode: 404,
                message: 'Offer not found'
            };
        }
        return {
            success: true,
            statusCode: 200,
            message: 'Offer fetched successfully',
            data: offer
        };
    } catch (error) {
        logger.error('Error in getOfferByIdService', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Update an existing offer
 */
export const updateOfferService = async (id, payload) => {
    try {
        const [[existing]] = await pool.query('SELECT * FROM offers WHERE id = ?', [id]);
        if (!existing) {
            return {
                success: false,
                statusCode: 404,
                message: 'Offer not found'
            };
        }

        const normalizedPayload = { ...payload };
        if (payload.offer_type !== undefined) {
            normalizedPayload.offer_type = normalizeOfferType(payload.offer_type);
        }

        const mergedData = { ...existing, ...normalizedPayload };
        const dupError = await checkDuplicateOffer(mergedData, id);
        if (dupError) {
            return {
                success: false,
                statusCode: 400,
                message: dupError
            };
        }

        const allowedFields = [
            'offer_name', 'offer_type', 'store_id', 'gift_card_id',
            'value_type', 'value', 'min_order_amount', 'max_discount',
            'total_usage_limit', 'per_user_limit', 'unique_users_only',
            'start_date', 'end_date', 'status'
        ];

        const fields = [];
        const params = [];

        Object.entries(normalizedPayload).forEach(([key, value]) => {
            if (!allowedFields.includes(key)) return;
            fields.push(`${key} = ?`);
            params.push(value === undefined ? null : value);
        });

        if (fields.length === 0) {
            return {
                success: false,
                statusCode: 400,
                message: 'No fields to update'
            };
        }

        params.push(id);
        await pool.query(
            `UPDATE offers SET ${fields.join(', ')} WHERE id = ?`,
            params
        );

        return {
            success: true,
            statusCode: 200,
            message: 'Offer updated successfully'
        };
    } catch (error) {
        logger.error('Error in updateOfferService', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Delete an offer
 */
export const deleteOfferService = async (id) => {
    try {
        const [[existing]] = await pool.query('SELECT id FROM offers WHERE id = ?', [id]);
        if (!existing) {
            return {
                success: false,
                statusCode: 404,
                message: 'Offer not found'
            };
        }

        await pool.query('DELETE FROM offers WHERE id = ?', [id]);

        return {
            success: true,
            statusCode: 200,
            message: 'Offer deleted successfully'
        };
    } catch (error) {
        logger.error('Error in deleteOfferService', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Change status of an offer
 */
export const changeOfferStatusService = async (id, status) => {
    try {
        const [[existing]] = await pool.query('SELECT * FROM offers WHERE id = ?', [id]);
        if (!existing) {
            return {
                success: false,
                statusCode: 404,
                message: 'Offer not found'
            };
        }

        if (Number(status) === OFFER_STATUS.ACTIVE) {
            const dupError = await checkDuplicateOffer({ ...existing, status }, id);
            if (dupError) {
                return {
                    success: false,
                    statusCode: 400,
                    message: dupError
                };
            }
        }

        await pool.query('UPDATE offers SET status = ? WHERE id = ?', [status, id]);

        return {
            success: true,
            statusCode: 200,
            message: 'Offer status updated successfully'
        };
    } catch (error) {
        logger.error('Error in changeOfferStatusService', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * View offer usage history
 */
export const getOfferUsageHistoryService = async (filters = {}) => {
    try {
        const { page = 1, limit = 10, offer_id, user_id, status } = filters;
        const pageVal = parseInt(page);
        const limitVal = parseInt(limit);
        const offset = (pageVal - 1) * limitVal;

        let countSql = 'SELECT COUNT(*) AS total FROM gift_card_orders WHERE offer_id IS NOT NULL';
        let querySql = `
            SELECT 
                gco.id AS order_id, 
                gco.offer_id, 
                gco.user_id, 
                gco.discount_amount, 
                gco.cashback_amount, 
                gco.created_at,
                CASE WHEN gco.status = 4 THEN 2 ELSE 1 END AS status,
                o.offer_name, 
                o.offer_type, 
                u.name AS user_name, 
                u.phone AS user_phone 
            FROM gift_card_orders gco
            JOIN offers o ON gco.offer_id = o.id
            JOIN user_master u ON gco.user_id = u.id
            WHERE gco.offer_id IS NOT NULL
        `;
        const params = [];

        if (offer_id) {
            countSql += ' AND offer_id = ?';
            querySql += ' AND gco.offer_id = ?';
            params.push(parseInt(offer_id));
        }

        if (user_id) {
            countSql += ' AND user_id = ?';
            querySql += ' AND gco.user_id = ?';
            params.push(parseInt(user_id));
        }

        if (status !== undefined && status !== null && status !== '' && status !== 'All') {
            const statusVal = parseInt(status);
            if (statusVal === 1) {
                countSql += ` AND status != ${GIFT_CARD_ORDER_STATUS.FAILED}`;
                querySql += ` AND gco.status != ${GIFT_CARD_ORDER_STATUS.FAILED}`;
            } else if (statusVal === 2) {
                countSql += ` AND status = ${GIFT_CARD_ORDER_STATUS.FAILED}`;
                querySql += ` AND gco.status = ${GIFT_CARD_ORDER_STATUS.FAILED}`;
            }
        }

        const [[{ total }]] = await pool.query(countSql, params);

        querySql += ' ORDER BY gco.id DESC LIMIT ? OFFSET ?';
        const queryParams = [...params, limitVal, offset];

        const [history] = await pool.query(querySql, queryParams);

        return {
            success: true,
            statusCode: 200,
            message: 'Offer usage history fetched successfully',
            data: history,
            pagination: {
                total,
                page: pageVal,
                limit: limitVal,
                totalPages: Math.ceil(total / limitVal)
            }
        };
    } catch (error) {
        logger.error('Error in getOfferUsageHistoryService', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Validate and calculate discounts for offers
 * This is executed atomically during checkout inside database transactions.
 */
export const validateAndCalculateOffer = async (userId, giftCardId, storeId, orderAmount, promoCode = null, connection = null) => {
    const db = connection || pool;
    const amountVal = parseFloat(orderAmount);

    // Fetch active offers
    const [activeOffers] = await db.query(
        `SELECT * FROM offers 
         WHERE status = ${OFFER_STATUS.ACTIVE} 
           AND start_date <= NOW() 
           AND end_date >= NOW()
           AND min_order_amount <= ?
           AND (store_id IS NULL OR store_id = ?)
           AND (gift_card_id IS NULL OR gift_card_id = ?)
         ORDER BY id DESC`,
        [amountVal, storeId || null, giftCardId || null]
    );

    if (activeOffers.length === 0) {
        return {
            instantDiscount: null,
            instantDiscountAmount: 0.00,
            promoCode: null,
            promoDiscountAmount: 0.00,
            cashback: null,
            cashbackAmount: 0.00
        };
    }

    const offerIds = activeOffers.map(offer => offer.id);

    // Fetch total successful usage counts for all offers in one bulk query
    const [globalUsages] = await db.query(
        `SELECT offer_id, COUNT(*) AS count 
         FROM gift_card_orders 
         WHERE offer_id IN (?) AND status != 4
         GROUP BY offer_id`,
        [offerIds]
    );

    const globalUsageMap = {};
    globalUsages.forEach(row => {
        globalUsageMap[row.offer_id] = row.count;
    });

    // Fetch user-specific successful usage counts for all offers in one bulk query
    const [userUsages] = await db.query(
        `SELECT offer_id, COUNT(*) AS count 
         FROM gift_card_orders 
         WHERE offer_id IN (?) AND user_id = ? AND status != 4
         GROUP BY offer_id`,
        [offerIds, userId]
    );

    const userUsageMap = {};
    userUsages.forEach(row => {
        userUsageMap[row.offer_id] = row.count;
    });

    let appliedInstantDiscount = null;
    let appliedPromoCode = null;
    let appliedCashback = null;

    let instantDiscountAmount = 0.00;
    let promoDiscountAmount = 0.00;
    let cashbackAmount = 0.00;

    for (const offer of activeOffers) {
        const totalCount = globalUsageMap[offer.id] || 0;
        const userCount = userUsageMap[offer.id] || 0;

        // Validate limits in-memory
        if (offer.total_usage_limit !== null && totalCount >= offer.total_usage_limit) {
            continue; // Limit reached, skip this offer
        }

        if (offer.per_user_limit !== null && userCount >= offer.per_user_limit) {
            continue; // Limit reached for this user, skip this offer
        }

        if (offer.unique_users_only === 1 && userCount > 0) {
            continue; // Already used by this user, skip
        }

        // Calculate offer value
        let offerCalculatedValue = 0.00;
        if (Number(offer.value_type) === VALUE_TYPE.FLAT) { // Flat
            offerCalculatedValue = parseFloat(offer.value);
        } else if (Number(offer.value_type) === VALUE_TYPE.PERCENTAGE) { // Percentage
            offerCalculatedValue = parseFloat((amountVal * (parseFloat(offer.value) / 100)).toFixed(2));
        }

        // Apply max_discount limit if set
        if (offer.max_discount !== null) {
            offerCalculatedValue = Math.min(offerCalculatedValue, parseFloat(offer.max_discount));
        }

        // Apply logic based on offer type
        if (offer.offer_type === OFFER_TYPE.INSTANT_DISCOUNT) {
            // Apply only one (highest priority) automatic Instant Discount
            if (!appliedInstantDiscount) {
                appliedInstantDiscount = offer;
                instantDiscountAmount = offerCalculatedValue;
            }
        } else if (offer.offer_type === OFFER_TYPE.PROMO_CODE) {
            // If the user submitted a promo code, match it
            if (promoCode && offer.promo_code && offer.promo_code.trim().toUpperCase() === promoCode.trim().toUpperCase()) {
                if (!appliedPromoCode) {
                    appliedPromoCode = offer;
                    promoDiscountAmount = offerCalculatedValue;
                }
            }
        } else if (offer.offer_type === OFFER_TYPE.CASHBACK) {
            // Apply only one (highest priority) automatic Cashback
            if (!appliedCashback) {
                appliedCashback = offer;
                cashbackAmount = offerCalculatedValue;
            }
        }
    }

    // If promoCode was provided by the user but no matching promo offer was validated, throw error
    if (promoCode && !appliedPromoCode) {
        throw { message: 'Invalid or expired promo code', code: 'INVALID_PROMO_CODE', statusCode: 400 };
    }

    return {
        instantDiscount: appliedInstantDiscount,
        instantDiscountAmount,
        promoCode: appliedPromoCode,
        promoDiscountAmount,
        cashback: appliedCashback,
        cashbackAmount
    };
};

/**
 * Fetch only active and valid (currently active and non-expired) offers for users
 */
export const getActiveOffersService = async () => {
    try {
        const [activeOffers] = await pool.query(
            `SELECT o.id, o.offer_name, o.offer_type, o.promo_code, o.value_type, o.value, 
                    o.min_order_amount, o.max_discount, o.end_date, o.store_id, o.gift_card_id,
                    s.store_name, gc.gift_card_name
             FROM offers o
             LEFT JOIN stores s ON o.store_id = s.id
             LEFT JOIN gift_cards gc ON o.gift_card_id = gc.id
             WHERE o.status = 1 
               AND o.start_date <= NOW() 
               AND o.end_date >= NOW()
             ORDER BY o.id DESC`
        );
        return {
            success: true,
            statusCode: 200,
            message: 'Active offers fetched successfully',
            data: activeOffers
        };
    } catch (error) {
        logger.error('Error in getActiveOffersService', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Validates a single offer for checkout or validation API.
 */
export const validateOfferForOrder = async (userId, giftCardId, storeId, orderAmount, offerId = null, connection = null) => {
    const db = connection || pool;
    const amountVal = parseFloat(orderAmount);

    let offer = null;
    if (offerId) {
        const [[foundOffer]] = await db.query(
            `SELECT * FROM offers WHERE id = ? AND status = 1`,
            [offerId]
        );
        offer = foundOffer;
    }

    if (!offer) {
        throw { message: 'Offer not found or inactive', code: 'OFFER_NOT_FOUND', statusCode: 400 };
    }

    // Check validity dates
    const now = new Date();
    if (new Date(offer.start_date) > now || new Date(offer.end_date) < now) {
        throw { message: 'Offer has expired or is not active yet', code: 'OFFER_EXPIRED', statusCode: 400 };
    }

    // Check minimum order amount
    if (amountVal < parseFloat(offer.min_order_amount)) {
        throw {
            message: `Minimum order amount of ₹${parseFloat(offer.min_order_amount).toFixed(2)} required for this offer`,
            code: 'MIN_AMOUNT_NOT_MET',
            statusCode: 400
        };
    }

    // Check store/gift card applicability
    if (offer.store_id !== null && offer.store_id !== storeId) {
        throw { message: 'Offer is not applicable for this store', code: 'INVALID_STORE', statusCode: 400 };
    }
    if (offer.gift_card_id !== null && offer.gift_card_id !== giftCardId) {
        throw { message: 'Offer is not applicable for this gift card', code: 'INVALID_GIFT_CARD', statusCode: 400 };
    }

    // Check global usage limit
    if (offer.total_usage_limit !== null) {
        const [[usageCount]] = await db.query(
            `SELECT COUNT(*) AS count FROM gift_card_orders WHERE offer_id = ? AND status != ${GIFT_CARD_ORDER_STATUS.FAILED}`,
            [offer.id]
        );
        if (usageCount.count >= offer.total_usage_limit) {
            throw { message: 'Offer usage limit reached', code: 'USAGE_LIMIT_REACHED', statusCode: 400 };
        }
    }

    // Check per user limit / unique users
    const [[userUsageCount]] = await db.query(
        `SELECT COUNT(*) AS count FROM gift_card_orders WHERE offer_id = ? AND user_id = ? AND status != ${GIFT_CARD_ORDER_STATUS.FAILED}`,
        [offer.id, userId]
    );
    if (offer.per_user_limit !== null && userUsageCount.count >= offer.per_user_limit) {
        throw { message: 'You have reached the usage limit for this offer', code: 'USER_LIMIT_REACHED', statusCode: 400 };
    }
    if (offer.unique_users_only === 1 && userUsageCount.count > 0) {
        throw { message: 'Offer is valid for first-time users only', code: 'FIRST_TIME_ONLY', statusCode: 400 };
    }

    // Calculate value
    let discountAmount = 0.00;
    let cashbackAmount = 0.00;
    let calculatedValue = 0.00;

    if (Number(offer.value_type) === VALUE_TYPE.FLAT) { // Flat
        calculatedValue = parseFloat(offer.value);
    } else if (Number(offer.value_type) === VALUE_TYPE.PERCENTAGE) { // Percentage
        calculatedValue = parseFloat((amountVal * (parseFloat(offer.value) / 100)).toFixed(2));
    }

    if (offer.max_discount !== null) {
        calculatedValue = Math.min(calculatedValue, parseFloat(offer.max_discount));
    }

    if (Number(offer.offer_type) === OFFER_TYPE.INSTANT_DISCOUNT) { // Instant Discount
        discountAmount = calculatedValue;
    } else if (Number(offer.offer_type) === OFFER_TYPE.CASHBACK) { // Cashback
        cashbackAmount = calculatedValue;
    }

    const payableAmount = Math.max(0, amountVal - discountAmount);

    return {
        offerId: offer.id,
        offerType: offer.offer_type,
        discountAmount,
        cashbackAmount,
        payableAmount
    };
};
