import pool from '../../config/dbConfig.js';

/**
 * Create a new dispute for an order item
 */
export const createDisputeService = async (userId, { orderId, orderItemId, subject, message }) => {
    // Run order existence and item matching queries in parallel
    const [orderRows, itemRows] = await Promise.all([
        pool.query('SELECT id FROM gift_card_orders WHERE id = ? AND user_id = ? LIMIT 1', [orderId, userId]),
        pool.query('SELECT id FROM gift_card_order_items WHERE id = ? AND order_id = ? LIMIT 1', [orderItemId, orderId])
    ]);

    const orderExists = orderRows[0].length > 0;
    const itemExists = itemRows[0].length > 0;

    if (!orderExists) {
        return {
            success: false,
            statusCode: 400,
            message: 'Invalid order or order does not belong to you'
        };
    }

    if (!itemExists) {
        return {
            success: false,
            statusCode: 400,
            message: 'Invalid order item for the specified order'
        };
    }

    // Insert new dispute record
    const [insertResult] = await pool.query(
        `INSERT INTO disputes (user_id, order_id, order_item_id, subject, message, status) 
         VALUES (?, ?, ?, ?, ?, 1)`,
        [userId, orderId, orderItemId, subject, message]
    );

    return {
        success: true,
        statusCode: 201,
        message: 'Dispute created successfully',
        data: {
            disputeId: insertResult.insertId,
            userId,
            orderId,
            orderItemId,
            subject,
            message,
            status: 1
        }
    };
};

/**
 * List disputes based on user permissions (admin sees all, customer sees only their own) with pagination
 */
export const getDisputesService = async (user, page = 1, limit = 10) => {
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.max(1, parseInt(limit) || 10);
    const offset = (parsedPage - 1) * parsedLimit;

    const isAdmin = user.role === 1 || user.role === 2;

    let countSql, countParams;
    let dataSql, dataParams;

    if (isAdmin) {
        countSql = `SELECT COUNT(*) as total FROM disputes`;
        countParams = [];

        dataSql = `
            SELECT d.*, u.full_name as user_name, u.email as user_email, 
                   o.woohoo_reference_no, oi.card_number 
            FROM disputes d 
            JOIN user_master u ON d.user_id = u.id 
            JOIN gift_card_orders o ON d.order_id = o.id 
            JOIN gift_card_order_items oi ON d.order_item_id = oi.id 
            ORDER BY d.id DESC
            LIMIT ? OFFSET ?
        `;
        dataParams = [parsedLimit, offset];
    } else {
        countSql = `SELECT COUNT(*) as total FROM disputes WHERE user_id = ?`;
        countParams = [user.id];

        dataSql = `
            SELECT d.*, o.woohoo_reference_no, oi.card_number 
            FROM disputes d 
            JOIN gift_card_orders o ON d.order_id = o.id 
            JOIN gift_card_order_items oi ON d.order_item_id = oi.id 
            WHERE d.user_id = ? 
            ORDER BY d.id DESC
            LIMIT ? OFFSET ?
        `;
        dataParams = [user.id, parsedLimit, offset];
    }

    // Execute queries in parallel
    const [[countResult], [rows]] = await Promise.all([
        pool.query(countSql, countParams),
        pool.query(dataSql, dataParams)
    ]);

    const totalDisputes = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalDisputes / parsedLimit);

    return {
        success: true,
        statusCode: 200,
        message: 'Disputes retrieved successfully',
        data: rows,
        pagination: {
            total: totalDisputes,
            page: parsedPage,
            limit: parsedLimit,
            totalPages
        }
    };
};

/**
 * Retrieve a specific dispute by ID with role-based access checks
 */
export const getDisputeByIdService = async (user, disputeId) => {
    const isAdmin = user.role === 1 || user.role === 2;

    const sql = `
        SELECT d.*, u.full_name as user_name, u.email as user_email, 
               o.woohoo_reference_no, oi.card_number 
        FROM disputes d 
        JOIN user_master u ON d.user_id = u.id 
        JOIN gift_card_orders o ON d.order_id = o.id 
        JOIN gift_card_order_items oi ON d.order_item_id = oi.id 
        WHERE d.id = ? 
        LIMIT 1
    `;

    const [[dispute]] = await pool.query(sql, [disputeId]);

    if (!dispute) {
        return {
            success: false,
            statusCode: 404,
            message: 'Dispute not found'
        };
    }

    // Role-based access validation
    if (!isAdmin && dispute.user_id !== user.id) {
        return {
            success: false,
            statusCode: 403,
            message: 'Access denied: You cannot view this dispute'
        };
    }

    return {
        success: true,
        statusCode: 200,
        message: 'Dispute details retrieved successfully',
        data: dispute
    };
};

/**
 * Update dispute status (Admin / Sub-Admin function only)
 */
export const updateDisputeStatusService = async (disputeId, status) => {
    const [[dispute]] = await pool.query('SELECT id FROM disputes WHERE id = ? LIMIT 1', [disputeId]);

    if (!dispute) {
        return {
            success: false,
            statusCode: 404,
            message: 'Dispute not found'
        };
    }

    await pool.query('UPDATE disputes SET status = ?, updated_at = NOW() WHERE id = ?', [status, disputeId]);

    return {
        success: true,
        statusCode: 200,
        message: 'Dispute status updated successfully',
        data: {
            disputeId,
            status
        }
    };
};
