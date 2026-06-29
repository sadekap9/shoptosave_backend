import pool, { runInTransaction } from '../../config/dbConfig.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';
import {
    WALLET_STATUS,
    WALLET_TRANSACTION_TYPE,
    WALLET_TRANSACTION_SOURCE,
    WALLET_TRANSACTION_STATUS,
    PAYMENT_TYPE,
    PAYMENT_TRANSACTION_STATUS
} from '../../config/constant/constant.js';

// ─── Transaction Number Generators ─────────────────────────────────────────────

/**
 * Generate next sequential wallet transaction number: WT000001, WT000002, ...
 * Must be called inside a transaction with the connection passed in.
 */
export const generateWalletTxnNo = async (connection) => {
    const [rows] = await connection.query(
        'SELECT transaction_no FROM wallet_transactions ORDER BY id DESC LIMIT 1'
    );
    const lastNum = rows.length > 0 ? parseInt(rows[0].transaction_no.replace('WT', '')) : 0;
    return 'WT' + String(lastNum + 1).padStart(6, '0');
};

/**
 * Generate next sequential payment transaction number: PAY000001, PAY000002, ...
 * Must be called inside a transaction with the connection passed in.
 */
export const generatePaymentTxnNo = async (connection) => {
    const [rows] = await connection.query(
        'SELECT transaction_no FROM payment_transactions ORDER BY id DESC LIMIT 1'
    );
    const lastNum = rows.length > 0 ? parseInt(rows[0].transaction_no.replace('PAY', '')) : 0;
    return 'PAY' + String(lastNum + 1).padStart(6, '0');
};

// ─── Wallet Helper ─────────────────────────────────────────────────────────────

/**
 * Get or create a user_wallet row for the given user.
 * If wallet status is not Active (1), throws WALLET_BLOCKED error.
 * @param {number} userId
 * @param {object} connection - optional DB connection (for use inside transactions)
 * @returns {object} wallet row
 */
export const getOrCreateWallet = async (userId, connection = null) => {
    const db = connection || pool;

    // Check if wallet exists
    const [[wallet]] = await db.query('SELECT * FROM user_wallet WHERE user_id = ?', [userId]);
    if (wallet) {
        if (wallet.status !== WALLET_STATUS.ACTIVE) {
            throw { message: 'Wallet is blocked', code: 'WALLET_BLOCKED', statusCode: 400 };
        }
        return wallet;
    }

    // Create a new wallet record if it doesn't exist
    const [result] = await db.query(
        `INSERT INTO user_wallet 
         (user_id, balance, total_cashback_earned, total_cashback_used, status)
         VALUES (?, 0.00, 0.00, 0.00, ?)`,
        [userId, WALLET_STATUS.ACTIVE]
    );
    logger.info(`[Wallet System] Automatically created wallet for User ${userId}`);

    const [[newWallet]] = await db.query('SELECT * FROM user_wallet WHERE id = ?', [result.insertId]);
    return newWallet;
};

// ─── Wallet Top-up ─────────────────────────────────────────────────────────────

/**
 * Wallet Top-up (Instant Auto-Approved)
 * 1. Get or create user_wallet — lock with FOR UPDATE
 * 2. Check wallet status
 * 3. Insert into payment_transactions (PAY number, status=Success)
 * 4. Insert into wallet_transactions (WT number, type=Credit, source=Topup)
 * 5. Update user_wallet balance
 * All inside a single runInTransaction block.
 */
export const addMoney = async (userId, { amount, payment_method, gateway_transaction_id }) => {
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
        throw { message: 'Invalid top-up amount', code: 'INVALID_AMOUNT', statusCode: 400 };
    }

    return await runInTransaction(async (connection) => {
        // 1. Get or create wallet and lock
        const wallet = await getOrCreateWallet(userId, connection);
        const [[lockedWallet]] = await connection.query(
            'SELECT id, balance, status FROM user_wallet WHERE id = ? FOR UPDATE',
            [wallet.id]
        );

        if (lockedWallet.status !== WALLET_STATUS.ACTIVE) {
            throw { message: 'Wallet is blocked', code: 'WALLET_BLOCKED', statusCode: 400 };
        }

        const currentBalance = parseFloat(lockedWallet.balance);
        const newBalance = currentBalance + amountVal;

        // 2. Generate PAY transaction number
        const payTxnNo = await generatePaymentTxnNo(connection);
        const gatewayTxnId = gateway_transaction_id || `DUMMY_${crypto.randomUUID()}`;

        // 3. Insert into payment_transactions
        await connection.query(
            `INSERT INTO payment_transactions 
             (transaction_no, user_id, order_id, payment_method, payment_type, amount, gateway_transaction_id, status)
             VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
            [
                payTxnNo,
                userId,
                parseInt(payment_method) || 1,
                PAYMENT_TYPE.WALLET_TOPUP,
                amountVal,
                gatewayTxnId,
                PAYMENT_TRANSACTION_STATUS.SUCCESS
            ]
        );

        // 4. Generate WT transaction number
        const wtTxnNo = await generateWalletTxnNo(connection);

        // 5. Insert into wallet_transactions
        await connection.query(
            `INSERT INTO wallet_transactions 
             (transaction_no, wallet_id, user_id, order_id, type, source, amount, balance_before, balance_after, remarks, status)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
            [
                wtTxnNo,
                wallet.id,
                userId,
                WALLET_TRANSACTION_TYPE.CREDIT,
                WALLET_TRANSACTION_SOURCE.WALLET_TOPUP,
                amountVal,
                currentBalance,
                newBalance,
                'Wallet top-up',
                WALLET_TRANSACTION_STATUS.SUCCESS
            ]
        );

        // 6. Update user_wallet balance
        await connection.query(
            'UPDATE user_wallet SET balance = balance + ? WHERE id = ?',
            [amountVal, wallet.id]
        );

        logger.info(`[Wallet System] Wallet top-up success. User: ${userId}, Amount: ₹${amountVal}, PayTxn: ${payTxnNo}, WtTxn: ${wtTxnNo}`);

        return {
            success: true,
            new_balance: newBalance,
            transaction_no: wtTxnNo,
            payment_transaction_no: payTxnNo
        };
    });
};

// ─── Wallet Balance API ────────────────────────────────────────────────────────

/**
 * Fetch wallet balance, cashback earned, and cashback used.
 */
export const getWalletDetailsService = async (userId) => {
    const wallet = await getOrCreateWallet(userId);
    return {
        success: true,
        statusCode: 200,
        message: 'Wallet details fetched successfully',
        data: {
            balance: parseFloat(wallet.balance).toFixed(2),
            total_cashback_earned: parseFloat(wallet.total_cashback_earned).toFixed(2),
            total_cashback_used: parseFloat(wallet.total_cashback_used).toFixed(2)
        }
    };
};

// ─── Wallet Transaction History ────────────────────────────────────────────────

/**
 * Fetch paginated wallet_transactions for a user, newest first.
 * @param {number} userId
 * @param {number} page - 1-indexed page number
 * @param {number} limit - records per page
 */
export const getWalletTransactionHistory = async (userId, page = 1, limit = 10) => {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = (pageNum - 1) * limitNum;

    const [[{ total }]] = await pool.query(
        'SELECT COUNT(*) AS total FROM wallet_transactions WHERE user_id = ?',
        [userId]
    );

    const [transactions] = await pool.query(
        `SELECT id, transaction_no, wallet_id, user_id, order_id, type, source, amount, 
                balance_before, balance_after, remarks, status, created_at
         FROM wallet_transactions
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ? OFFSET ?`,
        [userId, limitNum, offset]
    );

    return {
        success: true,
        statusCode: 200,
        message: 'Wallet transactions fetched successfully',
        data: {
            transactions,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum) || 1
            }
        }
    };
};

// ─── Wallet History (last 10 — legacy compatible) ──────────────────────────────

/**
 * Fetch wallet transactions history (all records, newest first).
 */
export const getWalletHistoryService = async (userId) => {
    const wallet = await getOrCreateWallet(userId);

    const [transactions] = await pool.query(
        `SELECT id, transaction_no, type, source, amount, balance_before, balance_after, created_at, remarks, status
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
 * Get available balance and last 10 transactions (for /balance endpoint).
 */
export const getWalletBalanceAndHistory = async (userId) => {
    const wallet = await getOrCreateWallet(userId);
    const [transactions] = await pool.query(
        `SELECT id, transaction_no, type, source, amount, balance_before, balance_after, created_at, remarks
         FROM wallet_transactions
         WHERE wallet_id = ?
         ORDER BY id DESC
         LIMIT 10`,
        [wallet.id]
    );

    return {
        success: true,
        data: {
            balance: parseFloat(wallet.balance).toFixed(2),
            total_cashback_earned: parseFloat(wallet.total_cashback_earned).toFixed(2),
            total_cashback_used: parseFloat(wallet.total_cashback_used).toFixed(2),
            recent_transactions: transactions
        }
    };
};

// ─── Credit Wallet ─────────────────────────────────────────────────────────────

/**
 * Credit user's wallet: UPDATE balance. Logs to wallet_transactions with type = Credit.
 * @param {number} userId
 * @param {number} amount
 * @param {number} source - WALLET_TRANSACTION_SOURCE value
 * @param {number|null} orderId - order FK or null
 * @param {string} remarks
 * @param {object} connection - DB connection (inside transaction)
 * @returns {{ walletId, transactionId, transactionNo }}
 */
export const creditWallet = async (userId, amount, source, orderId, remarks, connection) => {
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
        throw { message: 'Invalid credit amount', code: 'INVALID_AMOUNT', statusCode: 400 };
    }

    const wallet = await getOrCreateWallet(userId, connection);

    // Lock wallet row
    const [[lockedWallet]] = await connection.query(
        'SELECT id, balance, status FROM user_wallet WHERE id = ? FOR UPDATE',
        [wallet.id]
    );

    if (lockedWallet.status !== WALLET_STATUS.ACTIVE) {
        throw { message: 'Wallet is blocked', code: 'WALLET_BLOCKED', statusCode: 400 };
    }

    const balanceBefore = parseFloat(lockedWallet.balance);
    const balanceAfter = balanceBefore + amountVal;

    // Update user_wallet balance
    await connection.query(
        'UPDATE user_wallet SET balance = balance + ? WHERE id = ?',
        [amountVal, wallet.id]
    );

    // Generate WT transaction number and log transaction
    const txnNo = await generateWalletTxnNo(connection);
    const [txnResult] = await connection.query(
        `INSERT INTO wallet_transactions 
         (transaction_no, wallet_id, user_id, order_id, type, source, amount, balance_before, balance_after, remarks, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            txnNo,
            wallet.id,
            userId,
            orderId || null,
            WALLET_TRANSACTION_TYPE.CREDIT,
            source,
            amountVal,
            balanceBefore,
            balanceAfter,
            remarks || '',
            WALLET_TRANSACTION_STATUS.SUCCESS
        ]
    );

    return {
        walletId: wallet.id,
        transactionId: txnResult.insertId,
        transactionNo: txnNo
    };
};

// ─── Debit Wallet ──────────────────────────────────────────────────────────────

/**
 * Debit user's wallet: UPDATE balance. Logs to wallet_transactions with type = Debit.
 * @param {number} userId
 * @param {number} amount
 * @param {number} source - WALLET_TRANSACTION_SOURCE value
 * @param {number|null} orderId - order FK or null
 * @param {string} remarks
 * @param {object} connection - DB connection (inside transaction)
 * @returns {{ walletId, transactionId, transactionNo }}
 */
export const debitWallet = async (userId, amount, source, orderId, remarks, connection) => {
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
        throw { message: 'Invalid debit amount', code: 'INVALID_AMOUNT', statusCode: 400 };
    }

    const wallet = await getOrCreateWallet(userId, connection);

    // Lock wallet row
    const [[lockedWallet]] = await connection.query(
        'SELECT id, balance, status FROM user_wallet WHERE id = ? FOR UPDATE',
        [wallet.id]
    );

    if (lockedWallet.status !== WALLET_STATUS.ACTIVE) {
        throw { message: 'Wallet is blocked', code: 'WALLET_BLOCKED', statusCode: 400 };
    }

    const currentBalance = parseFloat(lockedWallet.balance);
    if (currentBalance < amountVal) {
        throw { message: 'Insufficient wallet balance', code: 'INSUFFICIENT_BALANCE', statusCode: 400 };
    }

    const balanceBefore = currentBalance;
    const balanceAfter = currentBalance - amountVal;

    // Update user_wallet balance
    await connection.query(
        'UPDATE user_wallet SET balance = balance - ? WHERE id = ?',
        [amountVal, wallet.id]
    );

    // Generate WT transaction number and log transaction
    const txnNo = await generateWalletTxnNo(connection);
    const [txnResult] = await connection.query(
        `INSERT INTO wallet_transactions 
         (transaction_no, wallet_id, user_id, order_id, type, source, amount, balance_before, balance_after, remarks, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            txnNo,
            wallet.id,
            userId,
            orderId || null,
            WALLET_TRANSACTION_TYPE.DEBIT,
            source,
            amountVal,
            balanceBefore,
            balanceAfter,
            remarks || '',
            WALLET_TRANSACTION_STATUS.SUCCESS
        ]
    );

    return {
        walletId: wallet.id,
        transactionId: txnResult.insertId,
        transactionNo: txnNo
    };
};

// ─── Legacy Topup (kept for backward compatibility) ────────────────────────────

/**
 * Request Wallet Topup (delegates to addMoney)
 */
export const requestTopupService = async (userId, topupData) => {
    return await addMoney(userId, {
        amount: topupData.amount,
        payment_method: topupData.payment_mode,
        gateway_transaction_id: topupData.payment_reference
    });
};

// ─── Withdraw (kept for backward compatibility) ────────────────────────────────

/**
 * Withdraw from Wallet
 */
export const withdraw = async (userId, { amount, reference_id }) => {
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
        throw { message: 'Invalid withdrawal amount', code: 'INVALID_AMOUNT', statusCode: 400 };
    }

    return await runInTransaction(async (connection) => {
        const debitRes = await debitWallet(
            userId,
            amountVal,
            WALLET_TRANSACTION_SOURCE.WALLET_TOPUP, // source: topup category for withdrawals
            null,
            `Wallet withdrawal. Ref: ${reference_id}`,
            connection
        );

        logger.info(`[Wallet System] Withdrawal completed for User ${userId}. Amount: ₹${amountVal}. TxnNo: ${debitRes.transactionNo}`);
        return {
            success: true,
            message: `Successfully withdrew ₹${amountVal.toFixed(2)} from wallet`
        };
    });
};
