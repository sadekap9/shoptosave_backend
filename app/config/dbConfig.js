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
    connectionLimit: 10,
    queueLimit: 0
});

// Test the connection
pool.getConnection()
    .then(async connection => {
        logger.info('Database connected successfully');
        
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS failed_login_attempts (
                    id bigint NOT NULL AUTO_INCREMENT,
                    identity varchar(100) NOT NULL,
                    ip_address varchar(45) NOT NULL,
                    attempt_type varchar(10) NOT NULL,
                    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_failed_attempts (identity, created_at),
                    KEY idx_ip_attempts (ip_address, created_at)
                )
            `);
            await connection.query(`
                CREATE TABLE IF NOT EXISTS otp_master (
                    id bigint NOT NULL AUTO_INCREMENT,
                    phone varchar(15) NOT NULL,
                    otp_hash varchar(255) NOT NULL,
                    purpose varchar(20) NOT NULL DEFAULT 'login',
                    attempts tinyint NOT NULL DEFAULT '0',
                    expires_at timestamp NOT NULL,
                    is_verified tinyint NOT NULL DEFAULT '0',
                    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_otp_phone (phone, is_verified, expires_at)
                )
            `);
            logger.info('Database tables verified/initialized successfully');
        } catch (tableErr) {
            logger.error('Failed to initialize database tables', { error: tableErr.message });
        }
        
        connection.release();
    })
    .catch(err => {
        logger.error('Database connection failed', { error: err.message });
    });

export const executeQuery = async (sql, params) => {
    try {
        const [rows] = await pool.execute(sql, params);
        return rows;
    } catch (error) {
        throw error;
    }
};

export default pool;
