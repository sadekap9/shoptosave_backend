import axios from 'axios';
import pool from '../../utils/db.js';
import { getWoohooToken } from './woohooAuth.service.js';
import { getWoohooHeaders } from '../../utils/woohoo.helper.js';
import logger from '../../utils/logger.js';

/**
 * Formats a single category row to match the Woohoo API response structure
 */
const formatWoohooCategory = (category, subcategories = []) => {
    return {
        id: category.id.toString(),
        name: category.name,
        url: category.url,
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
        if (category.maincategory_id === parentId) {
            // Find children
            const childCategories = buildWoohooTree(categories, category.id);
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
        'SELECT id, maincategory_id, name, url, description, image_url, thumbnail_url, color_code, offer_description FROM woohoo_categories WHERE is_active = 1'
    );

    return buildWoohooTree(rows, null);
};

export const getProductsByCategoryFromDB = async (categoryId) => {
    const [rows] = await pool.query(
        'SELECT sku, name, description, url, min_value as minPrice, max_value as maxPrice, currency_code, currency_symbol, currency_numeric_code, image_url as thumbnail, mobile_image as mobile, base_image as base, small_image as small FROM woohoo_products WHERE category_id = ? AND is_active = 1',
        [categoryId]
    );

    // Format to match Woohoo structure
    return rows.map(prod => ({
        sku: prod.sku,
        name: prod.name,
        currency: {
            code: prod.currency_code,
            symbol: prod.currency_symbol,
            numericCode: prod.currency_numeric_code
        },
        url: prod.url,
        minPrice: prod.minPrice.toString(),
        maxPrice: prod.maxPrice.toString(),
        images: {
            thumbnail: prod.thumbnail,
            mobile: prod.mobile,
            base: prod.base,
            small: prod.small
        }
    }));
};

/**
 * Recursively saves categories and subcategories to the database
 */
const saveCategoriesToDB = async (categories, mainCategoryId = null) => {
    for (const cat of categories) {
        // 1. Save current category
        await pool.query(
            `INSERT INTO woohoo_categories 
            (id, maincategory_id, name, url, description, image_url, thumbnail_url, color_code, offer_description) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
            maincategory_id=VALUES(maincategory_id), name=VALUES(name), url=VALUES(url), 
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

/**
 * Fetches products for all categories and syncs them to local DB
 */
export const syncProductsWithWoohoo = async () => {
    try {
        const token = await getWoohooToken();
        const [categories] = await pool.query('SELECT id FROM woohoo_categories WHERE is_active = 1');
        
        let totalSynced = 0;
        for (const cat of categories) {
            const url = `${process.env.WOOHOO_API_BASE_URL}/v3/catalog/categories/${cat.id}/products`;
            const headers = getWoohooHeaders('GET', url, null, token);
            
            try {
                const response = await axios.get(url, { headers });
                const products = response.data.products || [];
                
                for (const prod of products) {
                    await pool.query(
                         `INSERT INTO woohoo_products 
                        (sku, name, category_id, url, min_value, max_value, currency_code, currency_symbol, currency_numeric_code, image_url, mobile_image, base_image, small_image) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                        ON DUPLICATE KEY UPDATE 
                        name=VALUES(name), url=VALUES(url), min_value=VALUES(min_value), 
                        max_value=VALUES(max_value), currency_code=VALUES(currency_code), 
                        currency_symbol=VALUES(currency_symbol), currency_numeric_code=VALUES(currency_numeric_code), 
                        image_url=VALUES(image_url), mobile_image=VALUES(mobile_image), 
                        base_image=VALUES(base_image), small_image=VALUES(small_image)`,
                        [
                            prod.sku, prod.name, cat.id, prod.url, prod.minPrice, prod.maxPrice, 
                            prod.currency?.code, prod.currency?.symbol, prod.currency?.numericCode, 
                            prod.images?.thumbnail, prod.images?.mobile, prod.images?.base, prod.images?.small
                        ]
                    );
                    totalSynced++;
                }
            } catch (err) {
                logger.error(`Failed to sync products for category ${cat.id}`, { error: err.message });
            }
        }
        
        return { success: true, totalSynced };
    } catch (error) {
        logger.error('Product Sync Failed', { error: error.message });
        throw error;
    }
};
