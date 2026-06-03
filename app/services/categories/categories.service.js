import axios from 'axios';
import pool from '../../config/dbConfig.js';
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
 * Recursively saves categories and subcategories to the database
 */
export const saveCategoriesToDB = async (categories, mainCategoryId = null) => {
    for (const cat of categories) {
        // 1. Save current category
        await pool.query(
            `INSERT INTO woohoo_categories 
            (woohoo_category_id, parent_id, name, url_slug, description, image_url, thumbnail_url, color_code, offer_description) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
            parent_id=VALUES(parent_id), name=VALUES(name), url_slug=VALUES(url_slug), 
            description=VALUES(description), image_url=VALUES(image_url), 
            thumbnail_url=VALUES(thumbnail_url), color_code=VALUES(color_code), 
            offer_description=VALUES(offer_description)`,
            [
                cat.id, mainCategoryId, cat.name, cat.url, cat.description, 
                cat.images?.image, cat.images?.thumbnail, cat.colorCode, cat.offerDescription
            ]
        );

        // 2. If there are subcategories, save them recursively
        if (cat.subcategories && cat.subcategories.length > 0) {
            await saveCategoriesToDB(cat.subcategories, cat.id);
        }
    }
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
