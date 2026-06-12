import pool from './app/config/dbConfig.js';

async function main() {
    try {
        console.log('Connecting to database...');
        const [columns] = await pool.query('DESCRIBE banners');
        console.log('COLUMNS_BANNERS_START');
        console.log(JSON.stringify(columns, null, 2));
        console.log('COLUMNS_BANNERS_END');
    } catch (err) {
        console.error('Error describing tables:', err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}
main();
