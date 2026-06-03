import axios from 'axios';
import pool from '../../config/dbConfig.js';
import { getWoohooToken } from '../categories/woohooAuth.service.js';
import { getWoohooHeaders } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';

/**
 * Fetches products by category ID from DB
 */
export const getProductsByCategoryFromDB = async (categoryId) => {
    const [rows] = await pool.query(
        'SELECT sku, name, description, url_key as url, min_price as minPrice, max_price as maxPrice, currency_code, currency_symbol, currency_numeric_code, image_thumbnail as thumbnail, image_mobile as mobile, image_base as base, image_small as small FROM woohoo_products WHERE category_id = ? AND is_active = 1',
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
        minPrice: prod.minPrice ? prod.minPrice.toString() : '0',
        maxPrice: prod.maxPrice ? prod.maxPrice.toString() : '0',
        images: {
            thumbnail: prod.thumbnail,
            mobile: prod.mobile,
            base: prod.base,
            small: prod.small
        }
    }));
};

/**
 * Saves products of a given category to the database
 */
export const saveProductsToDB = async (products, categoryId) => {
    for (const prod of products) {
        await pool.query(
             `INSERT INTO woohoo_products 
            (sku, name, category_id, url_key, min_price, max_price, currency_code, currency_symbol, currency_numeric_code, image_thumbnail, image_mobile, image_base, image_small) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
            name=VALUES(name), category_id=VALUES(category_id), url_key=VALUES(url_key), min_price=VALUES(min_price), 
            max_price=VALUES(max_price), currency_code=VALUES(currency_code), 
            currency_symbol=VALUES(currency_symbol), currency_numeric_code=VALUES(currency_numeric_code), 
            image_thumbnail=VALUES(image_thumbnail), image_mobile=VALUES(image_mobile), 
            image_base=VALUES(image_base), image_small=VALUES(image_small)`,
            [
                prod.sku,
                prod.name,
                categoryId,
                prod.url || null,
                prod.minPrice || null,
                prod.maxPrice || null,
                prod.currency?.code || 'INR',
                prod.currency?.symbol || '₹',
                prod.currency?.numericCode || '356',
                prod.images?.thumbnail || null,
                prod.images?.mobile || null,
                prod.images?.base || null,
                prod.images?.small || null
            ]
        );
    }
};

/**
 * Fetches products for all categories and syncs them to local DB
 */
export const syncProductsWithWoohoo = async () => {
    try {
        const token = await getWoohooToken();
        const [categories] = await pool.query('SELECT woohoo_category_id AS id FROM woohoo_categories WHERE is_active = 1');
        
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
                        (sku, name, category_id, url_key, min_price, max_price, currency_code, currency_symbol, currency_numeric_code, image_thumbnail, image_mobile, image_base, image_small) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                        ON DUPLICATE KEY UPDATE 
                        name=VALUES(name), url_key=VALUES(url_key), min_price=VALUES(min_price), 
                        max_price=VALUES(max_price), currency_code=VALUES(currency_code), 
                        currency_symbol=VALUES(currency_symbol), currency_numeric_code=VALUES(currency_numeric_code), 
                        image_thumbnail=VALUES(image_thumbnail), image_mobile=VALUES(image_mobile), 
                        image_base=VALUES(image_base), image_small=VALUES(image_small)`,
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

/**
 * Stores one or more products in the database
 */
export const storeProductInDB = async (productData) => {
    const products = Array.isArray(productData) ? productData : [productData];
    const results = [];

    for (const prod of products) {
        if (!prod.sku || !prod.name || !prod.category_id) {
            throw new Error('sku, name, and category_id are required fields for each product');
        }

        await pool.query(
            `INSERT INTO woohoo_products 
            (sku, name, category_id, description, min_price, max_price, currency_code, currency_symbol, currency_numeric_code, image_thumbnail, image_mobile, image_base, image_small, url_key, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
            name=VALUES(name), category_id=VALUES(category_id), description=VALUES(description), min_price=VALUES(min_price), 
            max_price=VALUES(max_price), currency_code=VALUES(currency_code), currency_symbol=VALUES(currency_symbol), 
            currency_numeric_code=VALUES(currency_numeric_code), image_thumbnail=VALUES(image_thumbnail), image_mobile=VALUES(image_mobile), 
            image_base=VALUES(image_base), image_small=VALUES(image_small), url_key=VALUES(url_key), is_active=VALUES(is_active)`,
            [
                prod.sku,
                prod.name,
                prod.category_id,
                prod.description || null,
                prod.min_value || prod.minPrice || null,
                prod.max_value || prod.maxPrice || null,
                prod.currency_code || prod.currency?.code || 'INR',
                prod.currency_symbol || prod.currency?.symbol || '₹',
                prod.currency_numeric_code || prod.currency?.numericCode || '356',
                prod.image_url || prod.images?.thumbnail || null,
                prod.mobile_image || prod.images?.mobile || null,
                prod.base_image || prod.images?.base || null,
                prod.small_image || prod.images?.small || null,
                prod.url || null,
                prod.is_active !== undefined ? prod.is_active : 1
            ]
        );
        results.push(prod.sku);
    }
    return results;
};

/**
 * Fetches a product by its SKU from the local database
 */
export const getProductBySkuFromDB = async (sku) => {
    const [rows] = await pool.query(
        'SELECT sku, name, description, url_key as url, min_price as minPrice, max_price as maxPrice, currency_code, currency_symbol, currency_numeric_code, image_thumbnail as thumbnail, image_mobile as mobile, image_base as base, image_small as small, category_id, is_active FROM woohoo_products WHERE sku = ?',
        [sku]
    );

    if (rows.length === 0) {
        return null;
    }

    const prod = rows[0];

    // Format to match the Woohoo product structure
    return {
        sku: prod.sku,
        name: prod.name,
        description: prod.description,
        currency: {
            code: prod.currency_code,
            symbol: prod.currency_symbol,
            numericCode: prod.currency_numeric_code
        },
        url: prod.url,
        minPrice: prod.minPrice ? prod.minPrice.toString() : null,
        maxPrice: prod.maxPrice ? prod.maxPrice.toString() : null,
        images: {
            thumbnail: prod.thumbnail,
            mobile: prod.mobile,
            base: prod.base,
            small: prod.small
        },
        category_id: prod.category_id,
        is_active: prod.is_active
    };
};
