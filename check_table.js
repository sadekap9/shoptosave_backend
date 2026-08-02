import pool from './app/config/dbConfig.js';

async function checkTable() {
    try {
        const [columns] = await pool.query('SHOW COLUMNS FROM disputes');
        console.log('DISPUTES COLUMNS:', columns);
    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await pool.end();
    }
}

checkTable();
