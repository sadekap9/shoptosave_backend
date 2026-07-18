import pool from '../../config/dbConfig.js';
import logger from '../../utils/logger.js';
import { OFFER_STATUS, OFFER_TYPE, GIFT_CARD_ORDER_STATUS } from '../../config/constant/constant.js';

/* ==========================================================================
   HELPER UTILITIES
   ========================================================================== */

/**
 * Normalizes offer_type input (supports numbers 1, 2 or string representations)
 */
const normalizeOfferType = (type) => {
    if (type === 'instant_discount' || type === OFFER_TYPE.INSTANT_DISCOUNT || type === String(OFFER_TYPE.INSTANT_DISCOUNT)) {
        return OFFER_TYPE.INSTANT_DISCOUNT;
    }
    if (type === 'cashback' || type === OFFER_TYPE.CASHBACK || type === String(OFFER_TYPE.CASHBACK)) {
        return OFFER_TYPE.CASHBACK;
    }
    return Number(type);
};

/**
 * Generates user-facing display text based on offer type and percentage value
 */
const formatDisplayText = (offerType, value) => {
    const valNum = parseFloat(value);
    const offerTypeNum = Number(offerType);
    if (offerTypeNum === OFFER_TYPE.INSTANT_DISCOUNT) {
        return `${valNum}% OFF`;
    }
    if (offerTypeNum === OFFER_TYPE.CASHBACK) {
        return `${valNum}% Cashback`;
    }
    return `${valNum}%`;
};

/**
 * Formats an offer record for consistent API output
 */
const formatOfferResponse = (offer) => {
    if (!offer) return null;
    const offerTypeNum = Number(offer.offer_type);
    const valNum = parseFloat(offer.value);
    const titleVal = offer.title || offer.offer_name || '';

    return {
        id: offer.id,
        offer_name: titleVal,
        title: titleVal,
        description: offer.description || '',
        offer_type: offerTypeNum,
        value: valNum,
        display_text: formatDisplayText(offerTypeNum, valNum),
        store_id: offer.store_id || null,
        gift_card_id: offer.gift_card_id || null,
        start_date: offer.start_date,
        end_date: offer.end_date,
        status: Number(offer.status)
    };
};

/**
 * Helper to check duplicate active offers by target scope (gift_card_id, store_id, global)
 */
const checkDuplicateOffer = async (offerData, excludeId = null) => {
    const status = offerData.status !== undefined ? Number(offerData.status) : OFFER_STATUS.ACTIVE;
    if (status !== OFFER_STATUS.ACTIVE) {
        return null;
    }

    const titleVal = offerData.offer_name || offerData.title;
    const { store_id, gift_card_id } = offerData;

    if (!titleVal) return null;

    let sql = `SELECT id FROM offers WHERE title = ? AND status = ${OFFER_STATUS.ACTIVE}`;
    const params = [titleVal];

    if (gift_card_id) {
        sql += ` AND gift_card_id = ?`;
        params.push(Number(gift_card_id));
    } else if (store_id) {
        sql += ` AND store_id = ? AND (gift_card_id IS NULL OR gift_card_id = 0)`;
        params.push(Number(store_id));
    } else {
        sql += ` AND (store_id IS NULL OR store_id = 0) AND (gift_card_id IS NULL OR gift_card_id = 0)`;
    }

    if (excludeId) {
        sql += ` AND id != ?`;
        params.push(excludeId);
    }

    const [[existing]] = await pool.query(sql, params);
    if (existing) {
        let scopeLabel = 'all stores (global)';
        if (gift_card_id) scopeLabel = 'this specific gift card';
        else if (store_id) scopeLabel = 'this specific store';
        return `An active offer with the title '${titleVal}' already exists for ${scopeLabel}.`;
    }

    return null;
};

/* ==========================================================================
   SERVICE MODULE EXPORTS
   ========================================================================== */

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

    const storeId = gc.store_id || null;

    const [offers] = await db.query(
        `SELECT id, title, description, offer_type, value, store_id, gift_card_id, start_date, end_date, status
         FROM offers
         WHERE status = ${OFFER_STATUS.ACTIVE}
           AND start_date <= NOW()
           AND end_date >= NOW()
           AND (
             gift_card_id = ? OR 
             (store_id = ? AND (gift_card_id IS NULL OR gift_card_id = 0))
           )
         ORDER BY (CASE WHEN gift_card_id = ? THEN 2 ELSE 1 END) DESC, id DESC
         LIMIT 1`,
        [giftCardId, storeId, giftCardId]
    );

    return formatOfferResponse(offers[0]);
};

/**
 * Create a new offer
 */
export const createOfferService = async (payload) => {
    try {
        const normalizedOfferType = normalizeOfferType(payload.offer_type);
        const finalValue = parseFloat(payload.value);
        const titleVal = payload.title || payload.offer_name;

        const normalizedPayload = {
            title: titleVal,
            description: payload.description || null,
            offer_type: normalizedOfferType,
            value: finalValue,
            store_id: payload.store_id || null,
            gift_card_id: payload.gift_card_id || null,
            start_date: payload.start_date,
            end_date: payload.end_date,
            status: payload.status !== undefined ? Number(payload.status) : OFFER_STATUS.ACTIVE
        };

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
             (title, description, offer_type, value, store_id, gift_card_id, start_date, end_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                normalizedPayload.title,
                normalizedPayload.description,
                normalizedPayload.offer_type,
                normalizedPayload.value,
                normalizedPayload.store_id,
                normalizedPayload.gift_card_id,
                normalizedPayload.start_date,
                normalizedPayload.end_date,
                normalizedPayload.status
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
 * Get all offers with pagination, search, and status/type filters
 */
export const getOffersService = async (filters = {}) => {
    try {
        const { page = 1, limit = 10, search, offer_type, status } = filters;
        const pageVal = parseInt(page, 10);
        const limitVal = parseInt(limit, 10);
        const offset = (pageVal - 1) * limitVal;

        let countSql = `
            SELECT COUNT(*) AS total 
            FROM offers o
            LEFT JOIN stores s ON o.store_id = s.id
            LEFT JOIN gift_cards gc ON o.gift_card_id = gc.id
            WHERE 1=1
        `;
        let querySql = `
            SELECT o.id, o.title AS offer_name, o.title, o.description, o.offer_type, o.value, 
                   o.store_id, o.gift_card_id, o.start_date, o.end_date, o.status,
                   s.store_name, gc.gift_card_name 
            FROM offers o
            LEFT JOIN stores s ON o.store_id = s.id
            LEFT JOIN gift_cards gc ON o.gift_card_id = gc.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            countSql += ` AND o.title LIKE ?`;
            querySql += ` AND o.title LIKE ?`;
            params.push(`%${search}%`);
        }

        if (offer_type !== undefined && offer_type !== null && offer_type !== '' && offer_type !== 'All') {
            countSql += ' AND o.offer_type = ?';
            querySql += ' AND o.offer_type = ?';
            params.push(parseInt(offer_type, 10));
        }

        if (status !== undefined && status !== null && status !== '' && status !== 'All') {
            countSql += ' AND o.status = ?';
            querySql += ' AND o.status = ?';
            params.push(parseInt(status, 10));
        }

        querySql += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
        const queryParams = [...params, limitVal, offset];

        // Execute count, paginated rows, and status statistics concurrently
        const [[[{ total }]], [offers], [[stats]]] = await Promise.all([
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

        return {
            success: true,
            statusCode: 200,
            message: 'Offers fetched successfully',
            data: offers,
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
        const [[offer]] = await pool.query(
            `SELECT id, title AS offer_name, title, description, offer_type, value, store_id, gift_card_id, start_date, end_date, status, created_at, updated_at 
             FROM offers WHERE id = ?`,
            [id]
        );
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
        if (payload.offer_name || payload.title) {
            normalizedPayload.title = payload.title || payload.offer_name;
            delete normalizedPayload.offer_name;
        }
        if (payload.offer_type !== undefined) {
            normalizedPayload.offer_type = normalizeOfferType(payload.offer_type);
        }
        if (payload.value !== undefined) {
            normalizedPayload.value = parseFloat(payload.value);
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
            'title', 'description', 'offer_type', 'store_id', 'gift_card_id',
            'value', 'start_date', 'end_date', 'status'
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
 * Change status of an offer (Active / Inactive)
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

        const newStatus = Number(status);
        if (newStatus === OFFER_STATUS.ACTIVE) {
            const dupError = await checkDuplicateOffer({ ...existing, status: newStatus }, id);
            if (dupError) {
                return {
                    success: false,
                    statusCode: 400,
                    message: dupError
                };
            }
        }

        await pool.query('UPDATE offers SET status = ? WHERE id = ?', [newStatus, id]);

        return {
            success: true,
            statusCode: 200,
            message: `Offer status updated to ${newStatus === OFFER_STATUS.ACTIVE ? 'Active' : 'Inactive'} successfully`
        };
    } catch (error) {
        logger.error('Error in changeOfferStatusService', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * View usage history logs for offers
 */
export const getOfferUsageHistoryService = async (filters = {}) => {
    try {
        const { page = 1, limit = 10, offer_id, user_id, status } = filters;
        const pageVal = parseInt(page, 10);
        const limitVal = parseInt(limit, 10);
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
                o.title AS offer_name, 
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
            params.push(parseInt(offer_id, 10));
        }

        if (user_id) {
            countSql += ' AND user_id = ?';
            querySql += ' AND gco.user_id = ?';
            params.push(parseInt(user_id, 10));
        }

        if (status !== undefined && status !== null && status !== '' && status !== 'All') {
            const statusVal = parseInt(status, 10);
            if (statusVal === 1) {
                countSql += ` AND status != ${GIFT_CARD_ORDER_STATUS.FAILED}`;
                querySql += ` AND gco.status != ${GIFT_CARD_ORDER_STATUS.FAILED}`;
            } else if (statusVal === 2) {
                countSql += ` AND status = ${GIFT_CARD_ORDER_STATUS.FAILED}`;
                querySql += ` AND gco.status = ${GIFT_CARD_ORDER_STATUS.FAILED}`;
            }
        }

        querySql += ' ORDER BY gco.id DESC LIMIT ? OFFSET ?';
        const queryParams = [...params, limitVal, offset];

        const [[[{ total }]], [history]] = await Promise.all([
            pool.query(countSql, params),
            pool.query(querySql, queryParams)
        ]);

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
 * Validate and calculate discounts for offers during checkout
 */
export const validateAndCalculateOffer = async (userId, giftCardId, storeId, orderAmount, connection = null) => {
    const db = connection || pool;
    const amountVal = parseFloat(orderAmount);

    const [activeOffers] = await db.query(
        `SELECT id, title, offer_type, value, store_id, gift_card_id, start_date, end_date, status
         FROM offers 
         WHERE status = ${OFFER_STATUS.ACTIVE} 
           AND start_date <= NOW() 
           AND end_date >= NOW()
           AND (
             gift_card_id = ? OR 
             (store_id = ? AND (gift_card_id IS NULL OR gift_card_id = 0))
           )
         ORDER BY (CASE WHEN gift_card_id = ? THEN 2 ELSE 1 END) DESC, id DESC`,
        [giftCardId || null, storeId || null, giftCardId || null]
    );

    if (activeOffers.length === 0) {
        return {
            instantDiscount: null,
            instantDiscountAmount: 0.00,
            cashback: null,
            cashbackAmount: 0.00
        };
    }

    let appliedInstantDiscount = null;
    let appliedCashback = null;
    let instantDiscountAmount = 0.00;
    let cashbackAmount = 0.00;

    for (const offer of activeOffers) {
        const offerCalculatedValue = parseFloat((amountVal * (parseFloat(offer.value) / 100)).toFixed(2));

        if (Number(offer.offer_type) === OFFER_TYPE.INSTANT_DISCOUNT && !appliedInstantDiscount) {
            appliedInstantDiscount = offer;
            instantDiscountAmount = offerCalculatedValue;
        } else if (Number(offer.offer_type) === OFFER_TYPE.CASHBACK && !appliedCashback) {
            appliedCashback = offer;
            cashbackAmount = offerCalculatedValue;
        }
    }

    return {
        instantDiscount: appliedInstantDiscount,
        instantDiscountAmount,
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
            `SELECT o.id, o.title AS offer_name, o.title, o.description, o.offer_type, o.value, 
                    o.end_date, o.store_id, o.gift_card_id,
                    s.store_name, gc.gift_card_name
             FROM offers o
             LEFT JOIN stores s ON o.store_id = s.id
             LEFT JOIN gift_cards gc ON o.gift_card_id = gc.id
             WHERE o.status = ${OFFER_STATUS.ACTIVE} 
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
            `SELECT id, title, offer_type, value, store_id, gift_card_id, start_date, end_date, status 
             FROM offers 
             WHERE id = ? AND status = ${OFFER_STATUS.ACTIVE}`,
            [offerId]
        );
        offer = foundOffer;
    }

    if (!offer) {
        throw { message: 'Offer not found or inactive', code: 'OFFER_NOT_FOUND', statusCode: 400 };
    }

    const now = new Date();
    if (new Date(offer.start_date) > now || new Date(offer.end_date) < now) {
        throw { message: 'Offer has expired or is not active yet', code: 'OFFER_EXPIRED', statusCode: 400 };
    }

    if (offer.store_id !== null && offer.store_id !== storeId) {
        throw { message: 'Offer is not applicable for this store', code: 'INVALID_STORE', statusCode: 400 };
    }
    if (offer.gift_card_id !== null && offer.gift_card_id !== giftCardId) {
        throw { message: 'Offer is not applicable for this gift card', code: 'INVALID_GIFT_CARD', statusCode: 400 };
    }

    let discountAmount = 0.00;
    let cashbackAmount = 0.00;
    const calculatedValue = parseFloat((amountVal * (parseFloat(offer.value) / 100)).toFixed(2));

    if (Number(offer.offer_type) === OFFER_TYPE.INSTANT_DISCOUNT) {
        discountAmount = calculatedValue;
    } else if (Number(offer.offer_type) === OFFER_TYPE.CASHBACK) {
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
