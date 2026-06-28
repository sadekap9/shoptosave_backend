import pool from '../../config/dbConfig.js';
import { sanitizePaginationParams, buildPagination } from '../../helpers/pagination.helper.js';
import logger from '../../utils/logger.js';

/**
 * Fetch and filter wallet top-up requests (Admin only)
 */
export const getTopupRequests = async (filters) => {
    try {
        const { page, limit, status, request_no, user } = filters;
        const { offset, limit: limitVal } = sanitizePaginationParams(page, limit);

        let query = `
            SELECT wtr.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
            FROM wallet_topup_requests wtr
            JOIN user_master u ON wtr.user_id = u.id
            WHERE 1 = 1
        `;
        let countQuery = `
            SELECT COUNT(*) AS total
            FROM wallet_topup_requests wtr
            JOIN user_master u ON wtr.user_id = u.id
            WHERE 1 = 1
        `;
        const params = [];
        const countParams = [];

        if (status) {
            query += ` AND wtr.status = ?`;
            countQuery += ` AND wtr.status = ?`;
            params.push(status);
            countParams.push(status);
        }
        if (request_no) {
            query += ` AND wtr.request_no LIKE ?`;
            countQuery += ` AND wtr.request_no LIKE ?`;
            params.push(`%${request_no}%`);
            countParams.push(`%${request_no}%`);
        }
        if (user) {
            query += ` AND (u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)`;
            countQuery += ` AND (u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)`;
            const userLike = `%${user}%`;
            params.push(userLike, userLike, userLike);
            countParams.push(userLike, userLike, userLike);
        }

        query += ` ORDER BY wtr.id DESC LIMIT ? OFFSET ?`;
        params.push(limitVal, offset);

        const [[{ total }]] = await pool.query(countQuery, countParams);
        const [rows] = await pool.query(query, params);

        return {
            success: true,
            statusCode: 200,
            message: 'Top-up requests fetched successfully',
            data: rows,
            pagination: buildPagination(total, page, limitVal)
        };
    } catch (error) {
        logger.error('Error in getTopupRequests Service', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Fetch and filter all gift card orders (Admin only)
 */
export const getOrders = async (filters) => {
    try {
        const { page, limit, status, woohoo_reference_no, order_id, user } = filters;
        const { offset, limit: limitVal } = sanitizePaginationParams(page, limit);

        let query = `
            SELECT gco.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, gc.gift_card_name, gc.brand_name
            FROM gift_card_orders gco
            JOIN user_master u ON gco.user_id = u.id
            JOIN gift_cards gc ON gco.gift_card_id = gc.id
            WHERE 1 = 1
        `;
        let countQuery = `
            SELECT COUNT(*) AS total
            FROM gift_card_orders gco
            JOIN user_master u ON gco.user_id = u.id
            JOIN gift_cards gc ON gco.gift_card_id = gc.id
            WHERE 1 = 1
        `;
        const params = [];
        const countParams = [];

        if (status !== undefined && status !== null) {
            query += ` AND gco.status = ?`;
            countQuery += ` AND gco.status = ?`;
            params.push(status);
            countParams.push(status);
        }
        if (woohoo_reference_no) {
            query += ` AND gco.woohoo_reference_no LIKE ?`;
            countQuery += ` AND gco.woohoo_reference_no LIKE ?`;
            params.push(`%${woohoo_reference_no}%`);
            countParams.push(`%${woohoo_reference_no}%`);
        }
        if (order_id) {
            query += ` AND gco.id = ?`;
            countQuery += ` AND gco.id = ?`;
            params.push(order_id);
            countParams.push(order_id);
        }
        if (user) {
            query += ` AND (u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)`;
            countQuery += ` AND (u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)`;
            const userLike = `%${user}%`;
            params.push(userLike, userLike, userLike);
            countParams.push(userLike, userLike, userLike);
        }

        query += ` ORDER BY gco.id DESC LIMIT ? OFFSET ?`;
        params.push(limitVal, offset);

        const [[{ total }]] = await pool.query(countQuery, countParams);
        const [rows] = await pool.query(query, params);

        return {
            success: true,
            statusCode: 200,
            message: 'Orders fetched successfully',
            data: rows,
            pagination: buildPagination(total, page, limitVal)
        };
    } catch (error) {
        logger.error('Error in getOrders Service', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Fetch detailed order statistics (Admin only)
 */
export const getOrderDetails = async (orderId) => {
    try {
        const [[order]] = await pool.query(
            `SELECT gco.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, 
                    gc.gift_card_name, gc.brand_name, gc.brand_code, gc.description AS card_description
             FROM gift_card_orders gco
             JOIN user_master u ON gco.user_id = u.id
             JOIN gift_cards gc ON gco.gift_card_id = gc.id
             WHERE gco.id = ?`,
            [orderId]
        );

        if (!order) {
            return {
                success: false,
                statusCode: 404,
                message: 'Order not found'
            };
        }

        return {
            success: true,
            statusCode: 200,
            message: 'Order details fetched successfully',
            data: order
        };
    } catch (error) {
        logger.error('Error in getOrderDetails Service', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Manually refund an order (Super-Admin / Admin only)
 * Locks the row with SELECT FOR UPDATE and checks idempotency before executing credit balance update
 */
export const refundOrderManually = async (adminId, orderId, remarks) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // 1. Lock and retrieve order
        const [[order]] = await connection.query(
            'SELECT * FROM gift_card_orders WHERE id = ? FOR UPDATE',
            [orderId]
        );

        if (!order) {
            await connection.rollback();
            return {
                success: false,
                statusCode: 404,
                message: 'Order not found'
            };
        }

        // 2. Idempotency Check: Verify if a refund credit has already been processed in ledger
        const [[existingRefund]] = await connection.query(
            "SELECT id FROM wallet_transactions WHERE reference_id = ? AND type = 1 AND category = 0 LIMIT 1",
            [orderId]
        );

        if (existingRefund) {
            await connection.rollback();
            return {
                success: false,
                statusCode: 400,
                message: 'Order has already been refunded'
            };
        }

        // 3. Retrieve and lock User Wallet
        const [[wallet]] = await connection.query(
            'SELECT id, available_balance FROM wallets WHERE user_id = ? FOR UPDATE',
            [order.user_id]
        );

        if (!wallet) {
            await connection.rollback();
            return {
                success: false,
                statusCode: 404,
                message: 'User wallet not found for refund'
            };
        }

        const amount = parseFloat(order.amount);
        const openingBalance = parseFloat(wallet.available_balance);
        const closingBalance = openingBalance + amount;

        // 4. Update wallet available balance and total credited fields
        await connection.query(
            `UPDATE wallets 
             SET available_balance = available_balance + ?, 
                 total_credited = total_credited + ? 
             WHERE id = ?`,
            [amount, amount, wallet.id]
        );

        // 5. Insert refund transaction entry in wallet_transactions ledger (type = 1 [CREDIT])
        const txnNo = `TXN-REF-MAN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        await connection.query(
            `INSERT INTO wallet_transactions 
             (wallet_id, transaction_no, type, category, amount, opening_balance, closing_balance, reference_type, reference_id, status, remarks)
             VALUES (?, ?, 1, 0, ?, ?, ?, 1, ?, 1, ?)`,
            [wallet.id, txnNo, amount, openingBalance, closingBalance, order.id, remarks || `Manual refund approved by Admin ID: ${adminId}`]
        );

        // 6. Update order status to 4 (FAILED) and save manual comments
        await connection.query(
            `UPDATE gift_card_orders 
             SET status = 4, failure_reason = ? 
             WHERE id = ?`,
            [`Manually refunded by Admin. Reason: ${remarks}`, order.id]
        );

        await connection.commit();
        logger.info(`[Admin System] Manual Refund executed for Order ID: ${orderId} by Admin ID: ${adminId}. Ledger txn: ${txnNo}`);

        return {
            success: true,
            statusCode: 200,
            message: 'Order manually refunded and wallet credited successfully'
        };

    } catch (err) {
        await connection.rollback();
        logger.error(`[Admin System] Error during manual refund transaction for Order ID: ${orderId}`, { error: err.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Failed to process manual refund due to a database error'
        };
    } finally {
        connection.release();
    }
};
