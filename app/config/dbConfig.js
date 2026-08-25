import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 200,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

// Test the connection
pool.getConnection()
    .then(async (connection) => {
        logger.info('Database connected successfully');
        connection.release();

        // Auto-migration for sell_gift_card_requests columns
        try {
            const addColumnIfNotExist = async (columnName, definition) => {
                const [rows] = await pool.query(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sell_gift_card_requests' AND COLUMN_NAME = ?`,
                    [process.env.DB_NAME, columnName]
                );
                if (rows.length === 0) {
                    await pool.query(`ALTER TABLE sell_gift_card_requests ADD COLUMN ${columnName} ${definition}`);
                    logger.info(`Added column ${columnName} to sell_gift_card_requests`);
                }
            };

            await addColumnIfNotExist('approved_by', 'INT NULL');
            await addColumnIfNotExist('approved_at', 'DATETIME NULL');
            await addColumnIfNotExist('rejected_by', 'INT NULL');
            await addColumnIfNotExist('rejected_at', 'DATETIME NULL');
        } catch (migError) {
            logger.error('Error running migrations', { error: migError.message });
        }
    })
    .catch(err => {
        logger.error('Database connection failed', { error: err.message });
    });

export const executeQuery = async (sql, params) => {
    try {
        const [rows] = await pool.query(sql, params);
        return rows;
    } catch (error) {
        throw error;
    }
};

export const runInTransaction = async (callback) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

export default pool;
