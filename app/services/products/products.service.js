import axios from 'axios';
import pool from '../../config/dbConfig.js';
import { getWoohooToken } from '../categories/woohooAuth.service.js';
import { getWoohooHeaders } from '../../helpers/woohoo.helper.js';
import logger from '../../utils/logger.js';

/**
 * Saves a list of products fetched from Woohoo or input manually into local DB
 */
export const saveProductsToDB = async (products, categoryId) => {
    const productsArray = Array.isArray(products) ? products : [products];
    
    for (const prod of productsArray) {
        const sku = prod.sku;
        const name = prod.name;
        if (!sku || !name) continue;

        const description = prod.description || null;
        const product_type = prod.productType || prod.product_type || null;
        
        let price_type = null;
        let min_price = null;
        let max_price = null;
        let denominations = null;
        let currency_code = null;
        let currency_symbol = null;
        let currency_numeric_code = null;

        if (prod.price) {
            price_type = prod.price.type || prod.price.price_type || null;
            min_price = prod.price.min !== undefined ? prod.price.min : (prod.price.min_price !== undefined ? prod.price.min_price : null);
            max_price = prod.price.max !== undefined ? prod.price.max : (prod.price.max_price !== undefined ? prod.price.max_price : null);
            
            if (Array.isArray(prod.price.denominations)) {
                denominations = prod.price.denominations.join(',');
            } else if (prod.price.denominations) {
                denominations = prod.price.denominations.toString();
            }
            
            if (prod.price.currency) {
                currency_code = prod.price.currency.code || prod.price.currency.currency_code || null;
                currency_symbol = prod.price.currency.symbol || prod.price.currency.currency_symbol || null;
                currency_numeric_code = prod.price.currency.numericCode || prod.price.currency.currency_numeric_code || null;
            }
        }

        const url_key = prod.urlKey || prod.url_key || null;
        const offer_short_desc = prod.offerShortDesc || prod.offer_short_desc || null;
        
        const toTinyInt = (val) => {
            if (val === true || val === 'true' || val === 1 || val === '1') return 1;
            return 0;
        };

        const promo_available = toTinyInt(prod.promoAvailable !== undefined ? prod.promoAvailable : prod.promo_available);
        const designs_available = toTinyInt(prod.designsAvailable !== undefined ? prod.designsAvailable : prod.designs_available);
        const related_available = toTinyInt(prod.relatedAvailable !== undefined ? prod.relatedAvailable : prod.related_available);

        let image_thumbnail = null;
        let image_mobile = null;
        let image_base = null;
        let image_small = null;

        if (prod.images) {
            image_thumbnail = prod.images.thumbnail || prod.images.image_thumbnail || null;
            image_mobile = prod.images.mobile || prod.images.image_mobile || null;
            image_base = prod.images.base || prod.images.image_base || null;
            image_small = prod.images.small || prod.images.image_small || null;
        }

        const brand_logo = prod.brandLogo || prod.brand_logo || null;
        const emi_applicable = toTinyInt(prod.emiApplicable !== undefined ? prod.emiApplicable : prod.emi_applicable);

        let tnc_link = null;
        let tnc_content = null;
        if (prod.tnc) {
            tnc_link = prod.tnc.link || prod.tnc.tnc_link || null;
            tnc_content = prod.tnc.content || prod.tnc.tnc_content || null;
        }

        const expiry_info = prod.expiryInfo || prod.expiry_info || null;
        const kyc_enabled = toTinyInt(prod.kycEnabled !== undefined ? prod.kycEnabled : prod.kyc_enabled);
        const balance_enquiry_instruction = prod.balanceEnquiryInstruction || prod.balance_enquiry_instruction || null;
        const special_instruction = prod.specialInstruction || prod.special_instruction || null;
        const reload_card_number = toTinyInt(prod.reloadCardNumber !== undefined ? prod.reloadCardNumber : prod.reload_card_number);
        const is_active = toTinyInt(prod.isActive !== undefined ? prod.isActive : (prod.is_active !== undefined ? prod.is_active : true));
        const is_3pd = toTinyInt(prod.is3pd !== undefined ? prod.is3pd : prod.is_3pd);

        // Check SKU uniqueness in DB manually due to missing database level unique index
        const [[existing]] = await pool.query('SELECT id FROM woohoo_products WHERE sku = ?', [sku.trim()]);

        if (existing) {
            await pool.query(
                `UPDATE woohoo_products SET
                    category_id = ?, name = ?, description = ?, product_type = ?, price_type = ?,
                    min_price = ?, max_price = ?, denominations = ?, currency_code = ?,
                    currency_symbol = ?, currency_numeric_code = ?, url_key = ?, offer_short_desc = ?,
                    promo_available = ?, designs_available = ?, related_available = ?,
                    image_thumbnail = ?, image_mobile = ?, image_base = ?, image_small = ?,
                    brand_logo = ?, emi_applicable = ?, tnc_link = ?, tnc_content = ?,
                    expiry_info = ?, kyc_enabled = ?, balance_enquiry_instruction = ?,
                    special_instruction = ?, reload_card_number = ?, is_active = ?, is_3pd = ?,
                    synced_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [
                    categoryId, name, description, product_type, price_type,
                    min_price, max_price, denominations, currency_code,
                    currency_symbol, currency_numeric_code, url_key, offer_short_desc,
                    promo_available, designs_available, related_available,
                    image_thumbnail, image_mobile, image_base, image_small,
                    brand_logo, emi_applicable, tnc_link, tnc_content,
                    expiry_info, kyc_enabled, balance_enquiry_instruction,
                    special_instruction, reload_card_number, is_active, is_3pd,
                    existing.id
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO woohoo_products (
                    category_id, sku, name, description, product_type, price_type, min_price, max_price, 
                    denominations, currency_code, currency_symbol, currency_numeric_code, url_key, 
                    offer_short_desc, promo_available, designs_available, related_available, 
                    image_thumbnail, image_mobile, image_base, image_small, brand_logo, 
                    emi_applicable, tnc_link, tnc_content, expiry_info, kyc_enabled, 
                    balance_enquiry_instruction, special_instruction, reload_card_number, is_active, is_3pd
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    categoryId, sku.trim(), name, description, product_type, price_type, min_price, max_price,
                    denominations, currency_code, currency_symbol, currency_numeric_code, url_key,
                    offer_short_desc, promo_available, designs_available, related_available,
                    image_thumbnail, image_mobile, image_base, image_small, brand_logo,
                    emi_applicable, tnc_link, tnc_content, expiry_info, kyc_enabled,
                    balance_enquiry_instruction, special_instruction, reload_card_number, is_active, is_3pd
                ]
            );
        }
    }
};

/**
 * Get active products for a category
 */
export const getProductsByCategoryFromDB = async (categoryId) => {
    const [rows] = await pool.query(
        'SELECT * FROM woohoo_products WHERE category_id = ? AND is_active = 1 ORDER BY name ASC',
        [categoryId]
    );
    return rows;
};

/**
 * Get product details by SKU
 */
export const getProductBySkuFromDB = async (sku) => {
    const [[row]] = await pool.query(
        'SELECT * FROM woohoo_products WHERE sku = ?',
        [sku]
    );
    return row || null;
};

/**
 * Manually trigger product synchronization from Woohoo categories
 */
export const syncProductsWithWoohoo = async () => {
    try {
        const token = await getWoohooToken();
        const [categories] = await pool.query('SELECT id, woohoo_category_id FROM woohoo_categories WHERE is_active = 1');
        
        let totalSynced = 0;
        for (const cat of categories) {
            const url = `${process.env.WOOHOO_API_BASE_URL}/v3/catalog/categories/${cat.woohoo_category_id}/products`;
            const headers = getWoohooHeaders('GET', url, null, token);
            
            try {
                const response = await axios.get(url, { headers });
                const products = response.data.products || (Array.isArray(response.data) ? response.data : []);
                if (products && products.length > 0) {
                    await saveProductsToDB(products, cat.id);
                    totalSynced += products.length;
                }
            } catch (err) {
                logger.error(`Failed to sync products for category ${cat.woohoo_category_id}`, { error: err.message });
            }
        }
        
        return { success: true, count: totalSynced };
    } catch (error) {
        logger.error('Product Sync Failed', { error: error.message });
        throw error;
    }
};

/**
 * Bulk or single manual store of products in database
 */
export const storeProductInDB = async (data) => {
    const products = Array.isArray(data) ? data : [data];
    const storedSkus = [];
    
    for (const prod of products) {
        let categoryId = prod.category_id;
        if (!categoryId && prod.woohoo_category_id) {
            const [[cat]] = await pool.query('SELECT id FROM woohoo_categories WHERE woohoo_category_id = ?', [prod.woohoo_category_id]);
            if (cat) categoryId = cat.id;
        }
        
        if (!categoryId) {
            // Find or insert default category
            const [[stubCat]] = await pool.query("SELECT id FROM woohoo_categories LIMIT 1");
            if (stubCat) {
                categoryId = stubCat.id;
            } else {
                const [insCat] = await pool.query("INSERT INTO woohoo_categories (woohoo_category_id, name, is_active) VALUES ('default-cat', 'Default Category', 1)");
                categoryId = insCat.insertId;
            }
        }

        await saveProductsToDB([prod], categoryId);
        if (prod.sku) {
            storedSkus.push(prod.sku);
        }
    }
    return storedSkus;
};
