import pool from '../../config/dbConfig.js';

export const createDisputeService = async (userId, { subject, message }) => {
    // Insert new dispute record
    const [insertResult] = await pool.query(
        `INSERT INTO disputes (user_id, subject, message, status) 
         VALUES (?, ?, ?, 1)`,
        [userId, subject, message]
    );

    return {
        success: true,
        statusCode: 201,
        message: 'Dispute created successfully',
        data: {
            disputeId: insertResult.insertId
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
            SELECT d.id, d.subject, d.message, d.status 
            FROM disputes d 
            ORDER BY d.id DESC
            LIMIT ? OFFSET ?
        `;
        dataParams = [parsedLimit, offset];
    } else {
        countSql = `SELECT COUNT(*) as total FROM disputes WHERE user_id = ?`;
        countParams = [user.id];

        dataSql = `
            SELECT d.id, d.subject, d.message, d.status 
            FROM disputes d 
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
        SELECT d.*, u.name as user_name, u.email as user_email 
        FROM disputes d 
        JOIN user_master u ON d.user_id = u.id 
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

/**
 * List all disputes with full detailed user/card info for admin panel (with pagination)
 */
export const getAdminDisputesService = async (page = 1, limit = 10) => {
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.max(1, parseInt(limit) || 10);
    const offset = (parsedPage - 1) * parsedLimit;

    const countSql = `SELECT COUNT(*) as total FROM disputes`;
    const dataSql = `
        SELECT d.*, u.name as user_name, u.email as user_email 
        FROM disputes d 
        JOIN user_master u ON d.user_id = u.id 
        ORDER BY d.id DESC
        LIMIT ? OFFSET ?
    `;

    // Execute queries concurrently in parallel
    const [[countResult], [rows]] = await Promise.all([
        pool.query(countSql),
        pool.query(dataSql, [parsedLimit, offset])
    ]);

    const totalDisputes = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalDisputes / parsedLimit);

    return {
        success: true,
        statusCode: 200,
        message: 'All disputes retrieved successfully for admin',
        data: rows,
        pagination: {
            total: totalDisputes,
            page: parsedPage,
            limit: parsedLimit,
            totalPages
        }
    };
};
