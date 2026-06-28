import pool, { runInTransaction } from '../config/dbConfig.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Ensures a user always has a wallet mapped. Checks first before creating.
 * If wallet status is not 1 (Active), throws WALLET_BLOCKED error.
 */
export const getOrCreateWallet = async (userId, connection = null) => {
    const db = connection || pool;
    
    // Check if wallet exists
    const [[wallet]] = await db.query('SELECT * FROM wallets WHERE user_id = ?', [userId]);
    if (wallet) {
        if (wallet.status !== 1) {
            throw { message: 'Wallet is blocked', code: 'WALLET_BLOCKED', statusCode: 400 };
        }
        return wallet;
    }

    // Create a new wallet record if it doesn't exist
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
 * Credit user's wallet: UPDATE available_balance, total_credited.
 * Logs to wallet_transactions with type = 1 (Credit)
 */
export const creditWallet = async (userId, amount, category, referenceType, referenceId, remarks, connection) => {
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
        throw { message: 'Invalid credit amount', code: 'INVALID_AMOUNT', statusCode: 400 };
    }

    const wallet = await getOrCreateWallet(userId, connection);
    
    // Double-check wallet lock
    const [[lockedWallet]] = await connection.query(
        'SELECT id, available_balance, status FROM wallets WHERE id = ? FOR UPDATE',
        [wallet.id]
    );

    if (lockedWallet.status !== 1) {
        throw { message: 'Wallet is blocked', code: 'WALLET_BLOCKED', statusCode: 400 };
    }

    const openingBalance = parseFloat(lockedWallet.available_balance);
    const closingBalance = openingBalance + amountVal;

    // UPDATE available_balance, total_credited
    await connection.query(
        `UPDATE wallets 
         SET available_balance = available_balance + ?, 
             total_credited = total_credited + ? 
         WHERE id = ?`,
        [amountVal, amountVal, wallet.id]
    );

    // Log transaction
    const txnNo = `TXN_${crypto.randomUUID()}`;
    const [txnResult] = await connection.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, transaction_no, type, category, amount, opening_balance, closing_balance, reference_type, reference_id, status, remarks)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [wallet.id, txnNo, category, amountVal, openingBalance, closingBalance, referenceType, referenceId, remarks || '']
    );

    return {
        walletId: wallet.id,
        transactionId: txnResult.insertId,
        transactionNo: txnNo
    };
};

/**
 * Debit user's wallet: UPDATE available_balance, total_debited.
 * Logs to wallet_transactions with type = 2 (Debit)
 */
export const debitWallet = async (userId, amount, category, referenceType, referenceId, remarks, connection) => {
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
        throw { message: 'Invalid debit amount', code: 'INVALID_AMOUNT', statusCode: 400 };
    }

    const wallet = await getOrCreateWallet(userId, connection);
    
    // Double-check wallet lock
    const [[lockedWallet]] = await connection.query(
        'SELECT id, available_balance, status FROM wallets WHERE id = ? FOR UPDATE',
        [wallet.id]
    );

    if (lockedWallet.status !== 1) {
        throw { message: 'Wallet is blocked', code: 'WALLET_BLOCKED', statusCode: 400 };
    }

    const currentBalance = parseFloat(lockedWallet.available_balance);
    if (currentBalance < amountVal) {
        throw { message: 'Insufficient wallet balance', code: 'INSUFFICIENT_BALANCE', statusCode: 400 };
    }

    const openingBalance = currentBalance;
    const closingBalance = currentBalance - amountVal;

    // UPDATE available_balance, total_debited
    await connection.query(
        `UPDATE wallets 
         SET available_balance = available_balance - ?, 
             total_debited = total_debited + ? 
         WHERE id = ?`,
        [amountVal, amountVal, wallet.id]
    );

    // Log transaction
    const txnNo = `TXN_${crypto.randomUUID()}`;
    const [txnResult] = await connection.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, transaction_no, type, category, amount, opening_balance, closing_balance, reference_type, reference_id, status, remarks)
         VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [wallet.id, txnNo, category, amountVal, openingBalance, closingBalance, referenceType, referenceId, remarks || '']
    );

    return {
        walletId: wallet.id,
        transactionId: txnResult.insertId,
        transactionNo: txnNo
    };
};

/**
 * Auto-success top-up: Credits wallet immediately
 */
export const addMoney = async (userId, { amount, payment_mode, payment_reference }) => {
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
        throw { message: 'Invalid top-up amount', code: 'INVALID_AMOUNT', statusCode: 400 };
    }

    const validModes = [1, 2, 3]; // 1=UPI, 2=Bank, 3=Card
    const modeInt = parseInt(payment_mode);
    if (!validModes.includes(modeInt)) {
        throw { message: 'Invalid payment mode. Use 1 (UPI), 2 (Bank), or 3 (Card).', code: 'INVALID_PAYMENT_MODE', statusCode: 400 };
    }

    return await runInTransaction(async (connection) => {
        // 1. Lock wallet row and verify status (FOR UPDATE)
        const wallet = await getOrCreateWallet(userId, connection);
        const [[lockedWallet]] = await connection.query(
            'SELECT id, available_balance, status FROM wallets WHERE id = ? FOR UPDATE',
            [wallet.id]
        );

        if (lockedWallet.status !== 1) {
            throw { message: 'Wallet is blocked', code: 'WALLET_BLOCKED', statusCode: 400 };
        }

        // Idempotency check: Verify if a request with the same payment_reference exists
        const [[existing]] = await connection.query(
            'SELECT * FROM wallet_topup_requests WHERE payment_reference = ? AND user_id = ?',
            [payment_reference, userId]
        );
        if (existing) {
            logger.info(`[Wallet System] Top-up request with reference ${payment_reference} already processed.`);
            const [[currentWallet]] = await connection.query(
                'SELECT available_balance FROM wallets WHERE id = ?',
                [wallet.id]
            );
            return {
                success: true,
                request_no: existing.request_no,
                amount: parseFloat(existing.amount),
                new_balance: parseFloat(currentWallet.available_balance),
                status: "APPROVED"
            };
        }

        let remarks = 'Wallet topup';
        if (modeInt === 1) remarks = 'Wallet topup via UPI';
        else if (modeInt === 2) remarks = 'Bank Transfer';
        else if (modeInt === 3) remarks = 'Card';

        const requestNo = `TOPUP-${crypto.randomUUID()}`;

        // Insert into wallet_topup_requests with status = 2 (Approved) and approved_at = NOW()
        const [insertResult] = await connection.query(
            `INSERT INTO wallet_topup_requests 
             (user_id, request_no, amount, payment_mode, payment_reference, status, remarks, approved_by, approved_at)
             VALUES (?, ?, ?, ?, ?, 2, ?, ?, NOW())`,
            [userId, requestNo, amountVal, modeInt, payment_reference, remarks, userId]
        );
        const requestId = insertResult.insertId;

        // 2. Call creditWallet() immediately in the same transaction
        const creditRes = await creditWallet(
            userId,
            amountVal,
            1, // category=1 (WalletTopup)
            6, // reference_type=6 (WalletTopup)
            requestId, // reference_id (integer FK)
            remarks,
            connection
        );

        // Update transaction status=2 and format txn number as TXN-<uuid>
        const txnNo = `TXN-${crypto.randomUUID()}`;
        await connection.query(
            'UPDATE wallet_transactions SET status = 2, transaction_no = ? WHERE id = ?',
            [txnNo, creditRes.transactionId]
        );

        // Get closing balance
        const [[updatedWallet]] = await connection.query(
            'SELECT available_balance FROM wallets WHERE id = ?',
            [wallet.id]
        );
        const newBalance = parseFloat(updatedWallet.available_balance);

        logger.info(`[Wallet System] Instant top-up success. User: ${userId}, Amount: ₹${amountVal}, Ref: ${requestNo}`);

        return {
            success: true,
            request_no: requestNo,
            amount: amountVal,
            new_balance: newBalance,
            status: "APPROVED"
        };
    });
};

/**
 * Withdraw from Wallet
 */
export const withdraw = async (userId, { amount, reference_id }) => {
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
        throw { message: 'Invalid withdrawal amount', code: 'INVALID_AMOUNT', statusCode: 400 };
    }

    return await runInTransaction(async (connection) => {
        // 1. Idempotency Check: Verify if a withdrawal with this reference_id has already been processed
        const [[existing]] = await connection.query(
            'SELECT * FROM withdrawals WHERE reference_id = ?',
            [reference_id]
        );
        if (existing) {
            logger.info(`[Wallet System] Duplicate withdrawal request blocked. Ref: ${reference_id}`);
            return { success: true, message: 'Withdrawal already completed' };
        }

        // Fetch wallet first for reference ID
        const wallet = await getOrCreateWallet(userId, connection);

        // Insert pending/approved withdrawal placeholder
        const [insertResult] = await connection.query(
            `INSERT INTO withdrawals (wallet_id, amount, reference_id, status)
             VALUES (?, ?, ?, 'COMPLETED')`,
            [wallet.id, amountVal, reference_id]
        );

        // Debit the wallet (category = 3 [Refund? No, let's use 4 for Withdrawal], referenceType = 3 [Withdrawal])
        const debitRes = await debitWallet(
            userId,
            amountVal,
            4, // category=4 (Withdrawal)
            3, // reference_type=3 (Withdrawal)
            insertResult.insertId, // reference_id (integer FK)
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

/**
 * Get available balance, pending cashback, cashback earned, and the last 10 transactions
 */
export const getWalletBalanceAndHistory = async (userId) => {
    const wallet = await getOrCreateWallet(userId);
    const [transactions] = await pool.query(
        `SELECT id, transaction_no, type, category, amount, opening_balance, closing_balance, created_at, remarks
         FROM wallet_transactions
         WHERE wallet_id = ?
         ORDER BY id DESC
         LIMIT 10`,
        [wallet.id]
    );

    return {
        success: true,
        data: {
            available_balance: parseFloat(wallet.available_balance),
            pending_cashback: parseFloat(wallet.pending_cashback),
            cashback_earned: parseFloat(wallet.cashback_earned),
            recent_transactions: transactions
        }
    };
};
