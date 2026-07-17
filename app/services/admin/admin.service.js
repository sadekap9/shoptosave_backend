import pool from '../../config/dbConfig.js';
import { sanitizePaginationParams, buildPagination } from '../../helpers/pagination.helper.js';
import logger from '../../utils/logger.js';
import { creditWallet, generateWalletTxnNo } from '../wallets/wallets.service.js';
import {
    WALLET_TRANSACTION_TYPE,
    WALLET_TRANSACTION_SOURCE,
    WALLET_TRANSACTION_STATUS
} from '../../config/constant/constant.js';


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
            params.push(`${request_no}%`);
            countParams.push(`${request_no}%`);
        }
        if (user) {
            query += ` AND (u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)`;
            countQuery += ` AND (u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)`;
            const userLike = `${user}%`;
            params.push(userLike, userLike, userLike);
            countParams.push(userLike, userLike, userLike);
        }

        query += ` ORDER BY wtr.id DESC LIMIT ? OFFSET ?`;
        params.push(limitVal, offset);

        const [totalResult, rowsResult] = await Promise.all([
            pool.query(countQuery, countParams),
            pool.query(query, params)
        ]);
        const [[{ total }]] = totalResult;
        const [rows] = rowsResult;

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
            params.push(`${woohoo_reference_no}%`);
            countParams.push(`${woohoo_reference_no}%`);
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
            const userLike = `${user}%`;
            params.push(userLike, userLike, userLike);
            countParams.push(userLike, userLike, userLike);
        }

        query += ` ORDER BY gco.id DESC LIMIT ? OFFSET ?`;
        params.push(limitVal, offset);

        const [totalResult, rowsResult] = await Promise.all([
            pool.query(countQuery, countParams),
            pool.query(query, params)
        ]);
        const [[{ total }]] = totalResult;
        const [rows] = rowsResult;

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
 * Uses user_wallet and wallet_transactions tables.
 * Locks the row with SELECT FOR UPDATE and checks idempotency before executing credit balance update.
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
            return { success: false, statusCode: 404, message: 'Order not found' };
        }

        // 2. Idempotency Check: Verify if a refund credit has already been processed
        const [[existingRefund]] = await connection.query(
            'SELECT id FROM wallet_transactions WHERE order_id = ? AND type = ? AND source = ? LIMIT 1',
            [orderId, WALLET_TRANSACTION_TYPE.CREDIT, WALLET_TRANSACTION_SOURCE.REFUND]
        );

        if (existingRefund) {
            await connection.rollback();
            return { success: false, statusCode: 400, message: 'Order has already been refunded' };
        }

        // 3. Retrieve and lock user_wallet
        const [[wallet]] = await connection.query(
            'SELECT id, balance FROM user_wallet WHERE user_id = ? FOR UPDATE',
            [order.user_id]
        );

        if (!wallet) {
            await connection.rollback();
            return { success: false, statusCode: 404, message: 'User wallet not found for refund' };
        }

        // Refund only the wallet_amount portion (if it exists), otherwise refund full amount
        const refundAmount = parseFloat(order.wallet_amount) || parseFloat(order.amount);
        const balanceBefore = parseFloat(wallet.balance);
        const balanceAfter = balanceBefore + refundAmount;

        // 4. Update user_wallet balance
        await connection.query(
            'UPDATE user_wallet SET balance = balance + ? WHERE id = ?',
            [refundAmount, wallet.id]
        );

        // 5. Insert refund transaction entry in wallet_transactions (type = Credit, source = Refund)
        const txnNo = await generateWalletTxnNo(connection);
        await connection.query(
            `INSERT INTO wallet_transactions 
             (transaction_no, wallet_id, user_id, order_id, type, source, amount, balance_before, balance_after, remarks, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                txnNo,
                wallet.id,
                order.user_id,
                order.id,
                WALLET_TRANSACTION_TYPE.CREDIT,
                WALLET_TRANSACTION_SOURCE.REFUND,
                refundAmount,
                balanceBefore,
                balanceAfter,
                remarks || `Manual refund approved by Admin ID: ${adminId}`,
                WALLET_TRANSACTION_STATUS.SUCCESS
            ]
        );

        // 6. Update order status to 5 (Refunded)
        await connection.query(
            'UPDATE gift_card_orders SET status = 5, failure_reason = ? WHERE id = ?',
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
