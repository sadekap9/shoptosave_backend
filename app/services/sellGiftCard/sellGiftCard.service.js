import pool, { runInTransaction } from '../../config/dbConfig.js';
import { sanitizePaginationParams, buildPagination } from '../../helpers/pagination.helper.js';
import { creditWallet } from '../wallets/wallets.service.js';
import { WALLET_TRANSACTION_SOURCE } from '../../config/constant/constant.js';
import logger from '../../utils/logger.js';

/**
 * Search active gift card brands
 */
export const searchGiftCardBrandsService = async (filters = {}) => {
    const { search, page, limit } = filters;
    const { limit: parsedLimit, offset, page: parsedPage } = sanitizePaginationParams(page, limit);

    let countSql = `SELECT COUNT(*) AS total FROM gift_cards WHERE status = 1`;
    let querySql = `SELECT id, brand_name, COALESCE(gift_card_image, brand_logo) AS image FROM gift_cards WHERE status = 1`;
    const params = [];

    if (search) {
        const searchLike = `%${search.trim()}%`;
        countSql += ` AND (brand_name LIKE ? OR gift_card_name LIKE ?)`;
        querySql += ` AND (brand_name LIKE ? OR gift_card_name LIKE ?)`;
        params.push(searchLike, searchLike);
    }

    querySql += ` ORDER BY brand_name ASC LIMIT ? OFFSET ?`;
    const dataParams = [...params, parsedLimit, offset];

    const [countResult, dataResult] = await Promise.all([
        pool.query(countSql, params),
        pool.query(querySql, dataParams)
    ]);

    const [[{ total }]] = countResult;
    const [brands] = dataResult;

    return {
        success: true,
        statusCode: 200,
        message: 'Gift card brands retrieved successfully',
        data: brands,
        pagination: buildPagination(total, parsedPage, parsedLimit)
    };
};

/**
 * Submit sell gift card request
 */
export const submitSellRequestService = async (userId, { gift_card_id, card_number, card_pin, card_amount, expiry_date }) => {
    // Verify gift card brand exists and is active
    const [[giftCard]] = await pool.query('SELECT id FROM gift_cards WHERE id = ? AND status = 1', [gift_card_id]);
    if (!giftCard) {
        return {
            success: false,
            statusCode: 400,
            message: 'Invalid gift card brand selected or it is inactive'
        };
    }

    const [result] = await pool.query(
        `INSERT INTO sell_gift_card_requests 
         (user_id, gift_card_id, card_number, card_pin, card_amount, expiry_date, offered_amount, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, NULL, 1, NOW(), NOW())`,
        [userId, gift_card_id, card_number, card_pin, card_amount, expiry_date || null]
    );

    return {
        success: true,
        statusCode: 201,
        message: 'Sell gift card request submitted successfully',
        data: {
            requestId: result.insertId
        }
    };
};

/**
 * Get authenticated user's requests
 */
export const getMyRequestsService = async (userId, filters = {}) => {
    const { page, limit } = filters;
    const { limit: parsedLimit, offset, page: parsedPage } = sanitizePaginationParams(page, limit);

    const countSql = `SELECT COUNT(*) AS total FROM sell_gift_card_requests WHERE user_id = ?`;
    const querySql = `
        SELECT 
            sgr.id, 
            gc.brand_name, 
            COALESCE(gc.gift_card_image, gc.brand_logo) AS brand_image, 
            sgr.card_amount, 
            sgr.offered_amount, 
            sgr.status, 
            sgr.rejection_reason, 
            sgr.created_at
        FROM sell_gift_card_requests sgr
        JOIN gift_cards gc ON sgr.gift_card_id = gc.id
        WHERE sgr.user_id = ?
        ORDER BY sgr.id DESC
        LIMIT ? OFFSET ?
    `;

    const [countResult, dataResult] = await Promise.all([
        pool.query(countSql, [userId]),
        pool.query(querySql, [userId, parsedLimit, offset])
    ]);

    const [[{ total }]] = countResult;
    const [requests] = dataResult;

    return {
        success: true,
        statusCode: 200,
        message: 'My sell gift card requests retrieved successfully',
        data: requests,
        pagination: buildPagination(total, parsedPage, parsedLimit)
    };
};

/**
 * Get specific request details for user
 */
export const getRequestDetailsService = async (userId, requestId) => {
    const querySql = `
        SELECT 
            sgr.*, 
            gc.brand_name, 
            gc.gift_card_name,
            COALESCE(gc.gift_card_image, gc.brand_logo) AS brand_image
        FROM sell_gift_card_requests sgr
        JOIN gift_cards gc ON sgr.gift_card_id = gc.id
        WHERE sgr.id = ?
    `;

    const [[request]] = await pool.query(querySql, [requestId]);

    if (!request) {
        return {
            success: false,
            statusCode: 404,
            message: 'Sell gift card request not found'
        };
    }

    if (request.user_id !== userId) {
        return {
            success: false,
            statusCode: 403,
            message: 'Access denied: You cannot view this request'
        };
    }

    return {
        success: true,
        statusCode: 200,
        message: 'Request details retrieved successfully',
        data: request
    };
};

/**
 * Admin list requests
 */
export const adminListRequestsService = async (filters = {}) => {
    const { status, search, page, limit } = filters;
    const { limit: parsedLimit, offset, page: parsedPage } = sanitizePaginationParams(page, limit);

    let countSql = `
        SELECT COUNT(*) AS total 
        FROM sell_gift_card_requests sgr
        JOIN user_master u ON sgr.user_id = u.id
        JOIN gift_cards gc ON sgr.gift_card_id = gc.id
    `;
    let querySql = `
        SELECT 
            sgr.id, 
            u.name AS user_name, 
            u.email AS user_email, 
            gc.brand_name, 
            sgr.card_amount, 
            sgr.offered_amount, 
            sgr.status, 
            sgr.created_at
        FROM sell_gift_card_requests sgr
        JOIN user_master u ON sgr.user_id = u.id
        JOIN gift_cards gc ON sgr.gift_card_id = gc.id
    `;

    const queryFilters = [];
    const params = [];

    if (status) {
        queryFilters.push('sgr.status = ?');
        params.push(parseInt(status));
    }
    if (search) {
        queryFilters.push('(gc.brand_name LIKE ? OR sgr.card_number LIKE ?)');
        const searchLike = `%${search.trim()}%`;
        params.push(searchLike, searchLike);
    }

    if (queryFilters.length > 0) {
        const filterStr = ' WHERE ' + queryFilters.join(' AND ');
        countSql += filterStr;
        querySql += filterStr;
    }

    querySql += ` ORDER BY sgr.id DESC LIMIT ? OFFSET ?`;
    const dataParams = [...params, parsedLimit, offset];

    const [countResult, dataResult] = await Promise.all([
        pool.query(countSql, params),
        pool.query(querySql, dataParams)
    ]);

    const [[{ total }]] = countResult;
    const [requests] = dataResult;

    return {
        success: true,
        statusCode: 200,
        message: 'Admin list of sell gift card requests retrieved successfully',
        data: requests,
        pagination: buildPagination(total, parsedPage, parsedLimit)
    };
};

/**
 * Admin request details
 */
export const adminGetRequestDetailsService = async (requestId) => {
    const querySql = `
        SELECT 
            sgr.*, 
            u.name AS user_name, 
            u.email AS user_email, 
            u.phone AS user_phone,
            gc.brand_name, 
            gc.gift_card_name,
            COALESCE(gc.gift_card_image, gc.brand_logo) AS brand_image
        FROM sell_gift_card_requests sgr
        JOIN user_master u ON sgr.user_id = u.id
        JOIN gift_cards gc ON sgr.gift_card_id = gc.id
        WHERE sgr.id = ?
    `;

    const [[request]] = await pool.query(querySql, [requestId]);

    if (!request) {
        return {
            success: false,
            statusCode: 404,
            message: 'Sell gift card request not found'
        };
    }

    return {
        success: true,
        statusCode: 200,
        message: 'Request details retrieved successfully',
        data: request
    };
};

/**
 * Approve request
 */
export const adminApproveRequestService = async (requestId, offeredAmount) => {
    return await runInTransaction(async (connection) => {
        // Lock request row
        const [[request]] = await connection.query(
            'SELECT * FROM sell_gift_card_requests WHERE id = ? FOR UPDATE',
            [requestId]
        );

        if (!request) {
            throw { message: 'Sell gift card request not found', statusCode: 404 };
        }

        if (request.status !== 1) { // 1 = Pending
            throw { message: 'Only pending requests can be approved', statusCode: 400 };
        }

        // Update status to Approved (2)
        await connection.query(
            'UPDATE sell_gift_card_requests SET status = 2, offered_amount = ?, updated_at = NOW() WHERE id = ?',
            [offeredAmount, requestId]
        );

        // Credit user's wallet
        const remarks = `Payout for selling gift card request #${requestId}`;
        await creditWallet(
            request.user_id,
            offeredAmount,
            WALLET_TRANSACTION_SOURCE.SELL_GIFT_CARD,
            null, // orderId
            remarks,
            connection
        );

        return {
            success: true,
            statusCode: 200,
            message: 'Sell gift card request approved successfully'
        };
    });
};

/**
 * Reject request
 */
export const adminRejectRequestService = async (requestId, rejectionReason) => {
    const [[request]] = await pool.query(
        'SELECT * FROM sell_gift_card_requests WHERE id = ?',
        [requestId]
    );

    if (!request) {
        return {
            success: false,
            statusCode: 404,
            message: 'Sell gift card request not found'
        };
    }

    if (request.status !== 1) { // 1 = Pending
        return {
            success: false,
            statusCode: 400,
            message: 'Only pending requests can be rejected'
        };
    }

    await pool.query(
        'UPDATE sell_gift_card_requests SET status = 3, rejection_reason = ?, updated_at = NOW() WHERE id = ?',
        [rejectionReason, requestId]
    );

    return {
        success: true,
        statusCode: 200,
        message: 'Sell gift card request rejected successfully'
    };
};
