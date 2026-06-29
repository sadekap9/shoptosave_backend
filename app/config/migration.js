import pool from './dbConfig.js';
import logger from '../utils/logger.js';

/**
 * Dynamic Database Migrations
 */
export const runMigrations = async () => {
    try {
        logger.info('[Migration] Starting database schema migrations...');

        // 1. Check if discount_percentage column exists in gift_cards
        const [discountCols] = await pool.query("SHOW COLUMNS FROM gift_cards LIKE 'discount_percentage'");
        if (discountCols.length === 0) {
            logger.info("[Migration] Adding generated column 'discount_percentage' to 'gift_cards' table...");
            await pool.query(`
                ALTER TABLE gift_cards 
                ADD COLUMN discount_percentage DECIMAL(5,2) 
                GENERATED ALWAYS AS (
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(discounts, '$[0].value')) AS DECIMAL(5,2))
                ) STORED,
                ADD INDEX idx_discount_percentage (discount_percentage)
            `);
            logger.info("[Migration] Column 'discount_percentage' added successfully.");
        } else {
            logger.info("[Migration] Column 'discount_percentage' already exists.");
        }

        // 2. Check if ft_description FULLTEXT index exists on description
        const [indexes] = await pool.query("SHOW INDEX FROM gift_cards WHERE Key_name = 'ft_description'");
        if (indexes.length === 0) {
            logger.info("[Migration] Adding ft_description FULLTEXT index to 'gift_cards' table...");
            await pool.query(`
                ALTER TABLE gift_cards ADD FULLTEXT INDEX ft_description (description)
            `);
            logger.info("[Migration] FULLTEXT index 'ft_description' added successfully.");
        } else {
            logger.info("[Migration] FULLTEXT index 'ft_description' already exists.");
        }

        // 3. Create rate_limit_logs table
        logger.info("[Migration] Ensuring table 'rate_limit_logs' exists...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rate_limit_logs (
                rate_key VARCHAR(150) NOT NULL,
                hit_count INT DEFAULT 1,
                window_start DATETIME NOT NULL,
                blocked_until DATETIME NULL DEFAULT NULL,
                PRIMARY KEY (rate_key)
            )
        `);
        logger.info("[Migration] Table 'rate_limit_logs' is verified.");

        logger.info('[Migration] Database migrations completed successfully.');
    } catch (error) {
        logger.error('[Migration] Database migration failed', { error: error.message, stack: error.stack });
    }
};
