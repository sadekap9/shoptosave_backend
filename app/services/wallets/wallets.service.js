import pool from '../../config/dbConfig.js';
import logger from '../../utils/logger.js';

/**
 * Step 2: Get or Create Wallet Helper
 * Ensures a user always has a wallet mapped. Checks first before creating.
 */
export const getOrCreateWallet = async (userId, connection = null) => {
    const db = connection || pool;
    
    // Check if wallet exists
    const [[wallet]] = await db.query('SELECT * FROM wallets WHERE user_id = ?', [userId]);
    if (wallet) {
        return wallet;
    }

    // Create a new wallet record if it doesn't exist (Step 2)
    const [result] = await db.query(
        `INSERT INTO wallets 
         (user_id, available_balance, pending_cashback, cashback_earned, total_credited, total_debited, status)
         VALUES (?, 0.00, 0.00, 0.00, 0.00, 0.00, 1)`,
        [userId]
    );
    logger.info(`[Wallet System] Automatically created wallet for User ${userId}`);

    const [[newWallet]] = await db.query('SELECT * FROM wallets WHERE id = ?', [result.insertId]);
    return newWallet;
};

/**
 * Step 3: Create Wallet Top-up Request
 * Submits top-up details and flags it as Pending (status = 1)
 */
export const requestTopupService = async (userId, topupData) => {
    const { amount, payment_mode, payment_reference } = topupData;

    // Check / Create wallet first (Step 2 triggers on first wallet action)
    await getOrCreateWallet(userId);

    const requestNo = `REQ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Insert into wallet_topup_requests (status = 1 [Pending])
    await pool.query(
        `INSERT INTO wallet_topup_requests 
         (user_id, request_no, amount, payment_mode, payment_reference, status)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [userId, requestNo, amount, payment_mode, payment_reference]
    );

    return {
        success: true,
        statusCode: 201,
        message: 'Wallet top-up request submitted successfully and is pending approval.'
    };
};

/**
 * Step 4: Admin Approves / Rejects Wallet Request
 * Starts transaction, locks wallet with SELECT FOR UPDATE, credits amount, and updates status
 */
export const approveTopupService = async (adminId, requestId, status, remarks) => {
    // status: 2 = Approved, 3 = Rejected
    if (status !== 2 && status !== 3) {
        return {
            success: false,
            statusCode: 400,
            message: 'Invalid status. Status must be 2 (Approved) or 3 (Rejected)'
        };
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // Lock request row
        const [[request]] = await connection.query(
            'SELECT * FROM wallet_topup_requests WHERE id = ? FOR UPDATE',
            [requestId]
        );

        if (!request) {
            await connection.rollback();
            return {
                success: false,
                statusCode: 404,
                message: 'Top-up request not found'
            };
        }

        if (request.status !== 1) { // 1 = Pending
            await connection.rollback();
            return {
                success: false,
                statusCode: 400,
                message: 'Top-up request has already been processed'
            };
        }

        if (status === 3) {
            // Rejected path
            await connection.query(
                `UPDATE wallet_topup_requests 
                 SET status = 3, remarks = ?, approved_by = ?, approved_at = NOW() 
                 WHERE id = ?`,
                [remarks || 'Rejected by administrator', adminId, requestId]
            );
            await connection.commit();
            return {
                success: true,
                statusCode: 200,
                message: 'Top-up request has been rejected successfully'
            };
        }

        // Approved path (Step 4)
        // 1. Get and Lock User Wallet
        const wallet = await getOrCreateWallet(request.user_id, connection);
        const lockWalletResult = await connection.query(
            'SELECT id, available_balance, total_credited FROM wallets WHERE id = ? FOR UPDATE',
            [wallet.id]
        );
        const activeWallet = lockWalletResult[0][0];

        const amount = parseFloat(request.amount);
        const openingBalance = parseFloat(activeWallet.available_balance);
        const closingBalance = openingBalance + amount;

        // 2. Update wallet balance: available_balance += amount, total_credited += amount
        await connection.query(
            `UPDATE wallets 
             SET available_balance = available_balance + ?, 
                 total_credited = total_credited + ? 
             WHERE id = ?`,
            [amount, amount, wallet.id]
        );

        // 3. Insert into wallet_transactions (type = 1 [CREDIT], category = 1 [Wallet Topup], status = 1 [SUCCESS], reference_type = 2 [Topup Request])
        const txnNo = `TXN-TOPUP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        await connection.query(
            `INSERT INTO wallet_transactions 
             (wallet_id, transaction_no, type, category, amount, opening_balance, closing_balance, reference_type, reference_id, status, remarks)
             VALUES (?, ?, 1, 1, ?, ?, ?, 2, ?, 1, ?)`,
            [wallet.id, txnNo, amount, openingBalance, closingBalance, requestId, remarks || 'Wallet topup approved']
        );

        // 4. Update topup request status to 2 (Approved)
        await connection.query(
            `UPDATE wallet_topup_requests 
             SET status = 2, remarks = ?, approved_by = ?, approved_at = NOW() 
             WHERE id = ?`,
            [remarks || 'Approved by administrator', adminId, requestId]
        );

        await connection.commit();
        logger.info(`[Wallet System] Topup request ${requestId} approved by Admin ${adminId}`);

        return {
            success: true,
            statusCode: 200,
            message: 'Top-up request approved and wallet credited successfully'
        };

    } catch (err) {
        await connection.rollback();
        logger.error(`[Wallet System] Error during topup approval transaction: ${err.message}`, { error: err.stack });
        return {
            success: false,
            statusCode: 500,
            message: 'Internal database error during approval'
        };
    } finally {
        connection.release();
    }
};

/**
 * Step 13: Fetch Wallet Transactions History
 */
export const getWalletHistoryService = async (userId) => {
    // Auto-create wallet if it doesn't exist
    const wallet = await getOrCreateWallet(userId);

    const [transactions] = await pool.query(
        `SELECT id, transaction_no, type, category, amount, opening_balance, closing_balance, created_at, remarks
         FROM wallet_transactions
         WHERE wallet_id = ?
         ORDER BY id DESC`,
        [wallet.id]
    );

    return {
        success: true,
        statusCode: 200,
        message: 'Wallet history fetched successfully',
        data: transactions
    };
};

/**
 * Fetch current wallet balance
 */
export const getWalletDetailsService = async (userId) => {
    const wallet = await getOrCreateWallet(userId);
    return {
        success: true,
        statusCode: 200,
        message: 'Wallet details fetched successfully',
        data: {
            available_balance: parseFloat(wallet.available_balance),
            pending_cashback: parseFloat(wallet.pending_cashback),
            cashback_earned: parseFloat(wallet.cashback_earned)
        }
    };
};
