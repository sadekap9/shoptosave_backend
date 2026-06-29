import axios from 'axios';
import pool, { runInTransaction } from '../../config/dbConfig.js';
import { getWoohooToken } from './woohooAuth.service.js';
import { getWoohooHeaders } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';

/**
 * Formats a single category row to match the Woohoo API response structure
 */
const formatWoohooCategory = (category, subcategories = []) => {
    return {
        id: category.woohoo_category_id.toString(),
        name: category.name,
        url: category.url_slug,
        description: category.description,
        colorCode: category.color_code,
        offerDescription: category.offer_description,
        images: {
            image: category.image_url,
            thumbnail: category.thumbnail_url
        },
        subcategoriesCount: subcategories.length,
        subcategories: subcategories
    };
};

/**
 * Builds a recursive tree structure matching Woohoo's format
 */
const buildWoohooTree = (categories, parentId = null) => {
    const tree = [];
    for (const category of categories) {
        if (category.parent_id === parentId) {
            // Find children (match on woohoo_category_id)
            const childCategories = buildWoohooTree(categories, category.woohoo_category_id);
            // Format this node exactly like Woohoo
            tree.push(formatWoohooCategory(category, childCategories));
        }
    }
    return tree;
};

/**
 * Fetches all categories and returns them in EXACT Woohoo format
 */
export const getCategoriesFromDB = async () => {
    const [rows] = await pool.query(
        'SELECT woohoo_category_id, parent_id, name, url_slug, description, image_url, thumbnail_url, color_code, offer_description FROM woohoo_categories WHERE is_active = 1'
    );

    return buildWoohooTree(rows, null);
};

/**
 * Helper to recursively flatten category tree structures
 */
const flattenCategories = (categories, parentId = null, list = []) => {
    for (const cat of categories) {
        list.push({
            woohoo_category_id: cat.id,
            parent_id: parentId,
            name: cat.name,
            url_slug: cat.url,
            description: cat.description,
            image_url: cat.images?.image,
            thumbnail_url: cat.images?.thumbnail,
            color_code: cat.colorCode,
            offer_description: cat.offerDescription
        });
        if (cat.subcategories && cat.subcategories.length > 0) {
            flattenCategories(cat.subcategories, cat.id, list);
        }
    }
    return list;
};

/**
 * Saves categories and subcategories to the database in bulk batches
 */
export const saveCategoriesToDB = async (categories) => {
    const flatList = flattenCategories(categories, null, []);
    if (flatList.length === 0) return;

    await runInTransaction(async (connection) => {
        const BATCH_SIZE = 500;
        for (let i = 0; i < flatList.length; i += BATCH_SIZE) {
            const batch = flatList.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            
            const values = [];
            for (const item of batch) {
                values.push(
                    item.woohoo_category_id,
                    item.parent_id,
                    item.name,
                    item.url_slug,
                    item.description,
                    item.image_url,
                    item.thumbnail_url,
                    item.color_code,
                    item.offer_description
                );
            }

            const sql = `
                INSERT INTO woohoo_categories 
                (woohoo_category_id, parent_id, name, url_slug, description, image_url, thumbnail_url, color_code, offer_description) 
                VALUES ${placeholders}
                ON DUPLICATE KEY UPDATE 
                parent_id=VALUES(parent_id), name=VALUES(name), url_slug=VALUES(url_slug), 
                description=VALUES(description), image_url=VALUES(image_url), 
                thumbnail_url=VALUES(thumbnail_url), color_code=VALUES(color_code), 
                offer_description=VALUES(offer_description)
            `;

            await connection.query(sql, values);
        }
    });
};



/**
 * Fetches categories from Woohoo API and syncs them to local DB
 */
export const syncCategoriesWithWoohoo = async () => {
    try {
        const token = await getWoohooToken();
        const url = `${process.env.WOOHOO_API_BASE_URL}/v3/catalog/categories`;
        
        const headers = getWoohooHeaders('GET', url, null, token);
        const response = await axios.get(url, { headers });

        const woohooData = response.data;
        
        // Handle both single root object and array of roots
        const categoriesToSync = Array.isArray(woohooData) ? woohooData : [woohooData];

        await saveCategoriesToDB(categoriesToSync);
        
        return { success: true, count: categoriesToSync.length };
    } catch (error) {
        logger.error('Category Sync Failed', { error: error.message });
        throw error;
    }
};

export {
    getProductsByCategoryFromDB,
    saveProductsToDB,
    syncProductsWithWoohoo,
    storeProductInDB
} from '../products/products.service.js';
