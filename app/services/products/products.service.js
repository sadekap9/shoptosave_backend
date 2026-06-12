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

    let localCategoryInfo = null;
    if (categoryId) {
        try {
            const [[cat]] = await pool.query(
                'SELECT woohoo_category_id, name FROM woohoo_categories WHERE id = ?',
                [categoryId]
            );
            if (cat) {
                localCategoryInfo = { id: cat.woohoo_category_id, name: cat.name };
            }
        } catch (err) {
            logger.error(`Error fetching category info for ID ${categoryId}:`, err);
        }
    }
    
    for (const prod of productsArray) {
        const sku = prod.sku;
        const name = prod.name || prod.product_name || prod.productName;
        if (!sku || !name) continue;

        const woohoo_product_id = prod.id ? String(prod.id) : (prod.woohoo_product_id ? String(prod.woohoo_product_id) : null);
        const product_name = name;
        const brand_name = prod.brandName || prod.brand_name || null;
        const brand_code = prod.brandCode || prod.brand_code || null;
        const slug = prod.urlKey || prod.url_key || prod.slug || null;
        const product_type = prod.type || prod.productType || prod.product_type || null;
        const card_behaviour = prod.cardBehaviour || prod.card_behaviour || null;
        const description = prod.description || null;
        const short_description = prod.shortDescription || prod.short_description || null;
        const important_instructions = prod.importantInstructions || prod.important_instructions || prod.things_to_note || prod.specialInstruction || prod.special_instructions || null;
        
        let price_type = prod.price_type || null;
        let min_amount = prod.min_amount !== undefined ? prod.min_amount : (prod.min_price !== undefined ? prod.min_price : null);
        let max_amount = prod.max_amount !== undefined ? prod.max_amount : (prod.max_price !== undefined ? prod.max_price : null);
        let denominations = prod.denominations || null;
        let currency_code = prod.currency_code || null;
        let currency_symbol = prod.currency_symbol || null;
        let currency_numeric_code = prod.currency_numeric_code || null;

        if (prod.price) {
            price_type = prod.price.type || prod.price.price_type || price_type;
            min_amount = prod.price.min !== undefined ? prod.price.min : min_amount;
            max_amount = prod.price.max !== undefined ? prod.price.max : max_amount;
            
            if (prod.price.denominations) {
                denominations = prod.price.denominations;
            }
            
            if (prod.price.currency) {
                currency_code = prod.price.currency.code || prod.price.currency.currency_code || currency_code;
                currency_symbol = prod.price.currency.symbol || prod.price.currency.currency_symbol || currency_symbol;
                currency_numeric_code = prod.price.currency.numericCode || prod.price.currency.currency_numeric_code || currency_numeric_code;
            }
        }

        const expiry = prod.expiry || prod.expiry_info || prod.expiryInfo || null;
        
        const toTinyInt = (val) => {
            if (val === true || val === 'true' || val === 1 || val === '1') return 1;
            if (val === false || val === 'false' || val === 0 || val === '0') return 0;
            return null;
        };

        const toTinyIntDefault0 = (val) => {
            return toTinyInt(val) === 1 ? 1 : 0;
        };

        const toTinyIntDefault1 = (val) => {
            return toTinyInt(val) === 0 ? 0 : 1;
        };

        const toJSONString = (val) => {
            if (val === undefined || val === null) return null;
            if (typeof val === 'string') return val;
            return JSON.stringify(val);
        };

        const kyc_enabled = toTinyIntDefault0(prod.kycEnabled !== undefined ? prod.kycEnabled : prod.kyc_enabled);
        const disable_cart = toTinyIntDefault0(prod.disableCart !== undefined ? prod.disableCart : prod.disable_cart);
        const scheduling_enabled = toTinyIntDefault0(prod.schedulingEnabled !== undefined ? prod.schedulingEnabled : prod.scheduling_enabled);
        const add_card_to_wallet = toTinyIntDefault0(prod.addCardToWallet !== undefined ? prod.addCardToWallet : prod.add_card_to_wallet);
        const emi_applicable = toTinyIntDefault0(prod.emiApplicable !== undefined ? prod.emiApplicable : prod.emi_applicable);

        let thumbnail_image = prod.thumbnail_image || prod.image_thumbnail || null;
        let mobile_image = prod.mobile_image || prod.image_mobile || null;
        let base_image = prod.base_image || prod.image_base || null;
        let small_image = prod.small_image || prod.image_small || null;

        if (prod.images) {
            thumbnail_image = prod.images.thumbnail || prod.images.image_thumbnail || thumbnail_image;
            mobile_image = prod.images.mobile || prod.images.image_mobile || mobile_image;
            base_image = prod.images.base || prod.images.image_base || base_image;
            small_image = prod.images.small || prod.images.image_small || small_image;
        }

        const brand_logo = prod.brandLogo || prod.brand_logo || null;

        let tnc_link = prod.tnc_link || null;
        let tnc_content = prod.tnc_content || null;
        if (prod.tnc) {
            tnc_link = prod.tnc.link || prod.tnc.tnc_link || tnc_link;
            tnc_content = prod.tnc.content || prod.tnc.tnc_content || tnc_content;
        }

        const page_title = prod.pageTitle || prod.page_title || null;
        const meta_title = prod.metaTitle || prod.meta_title || null;
        let meta_keywords = prod.metaKeywords || prod.meta_keywords || null;
        if (Array.isArray(meta_keywords)) {
            meta_keywords = meta_keywords.join(',');
        }
        const meta_description = prod.metaDescription || prod.meta_description || null;

        let productCategories = prod.categories || null;
        if (!productCategories && localCategoryInfo) {
            productCategories = [localCategoryInfo];
        }

        const themes = prod.themes || null;
        const discounts = prod.discounts || null;
        const corporate_discounts = prod.corporateDiscounts || prod.corporate_discounts || null;
        const related_products = prod.relatedProducts || prod.related_products || prod.related || null;
        const redemption_rules = prod.redemptionRules || prod.redemption_rules || null;
        const redemption_terms = prod.redemptionTerms || prod.redemption_terms || null;

        const cpg_type = prod.cpgType || prod.cpg_type || null;
        const cpg_code = prod.cpgCode || prod.cpg_code || null;
        const issuer_name = prod.issuerName || prod.issuer_name || null;

        let payout_enabled = toTinyIntDefault0(prod.payout_enabled);
        let payout_payment_methods = prod.payout_payment_methods || null;
        let payout_account_types = prod.payout_account_types || null;
        let payout_transaction_types = prod.payout_transaction_types || null;
        let max_beneficiaries = prod.max_beneficiaries !== undefined ? prod.max_beneficiaries : null;
        let validation_amount = prod.validation_amount || null;
        let edit_beneficiary = prod.edit_beneficiary !== undefined ? toTinyInt(prod.edit_beneficiary) : null;
        let convenience_charge = prod.convenience_charge || null;
        let vpa_penny_drop_required = prod.vpa_penny_drop_required !== undefined ? toTinyInt(prod.vpa_penny_drop_required) : null;
        let handling_charges = prod.handling_charges || null;
        let convenience_charges = prod.convenience_charges || null;

        if (prod.payout) {
            payout_enabled = toTinyIntDefault0(prod.payout.enabled !== undefined ? prod.payout.enabled : payout_enabled);
            payout_payment_methods = prod.payout.paymentMethods || payout_payment_methods;
            payout_account_types = prod.payout.accountTypes || payout_account_types;
            payout_transaction_types = prod.payout.transactionTypes || payout_transaction_types;
            max_beneficiaries = prod.payout.maxBeneficiaries !== undefined ? prod.payout.maxBeneficiaries : max_beneficiaries;
            validation_amount = prod.payout.validationAmount || validation_amount;
            edit_beneficiary = prod.payout.editBeneficiary !== undefined ? toTinyInt(prod.payout.editBeneficiary) : edit_beneficiary;
            convenience_charge = prod.payout.convenienceCharge || convenience_charge;
            vpa_penny_drop_required = prod.payout.vpaPennyDropRequired !== undefined ? toTinyInt(prod.payout.vpaPennyDropRequired) : vpa_penny_drop_required;
            handling_charges = prod.payout.handlingCharges || handling_charges;
            convenience_charges = prod.payout.convenienceCharges || convenience_charges;
        }

        const travel_pass = prod.travelPass || prod.travel_pass || null;
        const order_modes = prod.orderModes || prod.order_modes || null;
        const reload_card_number = toTinyIntDefault0(prod.reloadCardNumber !== undefined ? prod.reloadCardNumber : prod.reload_card_number);
        const custom_themes_available = toTinyIntDefault0(prod.customThemesAvailable !== undefined ? prod.customThemesAvailable : prod.custom_themes_available);
        const store_locator_url = prod.storeLocatorUrl || prod.store_locator_url || null;
        const eta_message = prod.etaMessage || prod.eta_message || null;

        const status = toTinyIntDefault1(prod.isActive !== undefined ? prod.isActive : (prod.is_active !== undefined ? prod.is_active : (prod.status !== undefined ? prod.status : true)));
        const sync_response = prod;

        // Check SKU uniqueness in DB manually
        const [[existing]] = await pool.query('SELECT id FROM woohoo_products WHERE sku = ?', [sku.trim()]);

        if (existing) {
            await pool.query(
                `UPDATE woohoo_products SET
                    woohoo_product_id = ?, product_name = ?, brand_name = ?, brand_code = ?, slug = ?,
                    product_type = ?, card_behaviour = ?, description = ?, short_description = ?,
                    important_instructions = ?, price_type = ?, min_amount = ?, max_amount = ?,
                    currency_code = ?, currency_symbol = ?, currency_numeric_code = ?, denominations = ?,
                    expiry = ?, kyc_enabled = ?, disable_cart = ?, scheduling_enabled = ?,
                    add_card_to_wallet = ?, emi_applicable = ?, thumbnail_image = ?, mobile_image = ?,
                    base_image = ?, small_image = ?, brand_logo = ?, tnc_link = ?, tnc_content = ?,
                    page_title = ?, meta_title = ?, meta_keywords = ?, meta_description = ?,
                    categories = ?, themes = ?, discounts = ?, corporate_discounts = ?,
                    related_products = ?, redemption_rules = ?, redemption_terms = ?, cpg_type = ?,
                    cpg_code = ?, issuer_name = ?, payout_enabled = ?, payout_payment_methods = ?,
                    payout_account_types = ?, payout_transaction_types = ?, max_beneficiaries = ?,
                    validation_amount = ?, edit_beneficiary = ?, convenience_charge = ?,
                    vpa_penny_drop_required = ?, handling_charges = ?, convenience_charges = ?,
                    travel_pass = ?, order_modes = ?, reload_card_number = ?, custom_themes_available = ?,
                    store_locator_url = ?, eta_message = ?, status = ?, sync_response = ?
                WHERE id = ?`,
                [
                    woohoo_product_id, product_name, brand_name, brand_code, slug,
                    product_type, card_behaviour, description, short_description,
                    important_instructions, price_type, min_amount, max_amount,
                    currency_code, currency_symbol, currency_numeric_code, toJSONString(denominations),
                    expiry, kyc_enabled, disable_cart, scheduling_enabled,
                    add_card_to_wallet, emi_applicable, thumbnail_image, mobile_image,
                    base_image, small_image, brand_logo, tnc_link, tnc_content,
                    page_title, meta_title, meta_keywords, meta_description,
                    toJSONString(productCategories), toJSONString(themes), toJSONString(discounts), toJSONString(corporate_discounts),
                    toJSONString(related_products), toJSONString(redemption_rules), toJSONString(redemption_terms), cpg_type,
                    cpg_code, issuer_name, payout_enabled, toJSONString(payout_payment_methods),
                    toJSONString(payout_account_types), toJSONString(payout_transaction_types), max_beneficiaries,
                    validation_amount, edit_beneficiary, convenience_charge,
                    vpa_penny_drop_required, toJSONString(handling_charges), toJSONString(convenience_charges),
                    toJSONString(travel_pass), toJSONString(order_modes), reload_card_number, custom_themes_available,
                    store_locator_url, eta_message, status, toJSONString(sync_response),
                    existing.id
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO woohoo_products (
                    woohoo_product_id, sku, product_name, brand_name, brand_code, slug,
                    product_type, card_behaviour, description, short_description,
                    important_instructions, price_type, min_amount, max_amount,
                    currency_code, currency_symbol, currency_numeric_code, denominations,
                    expiry, kyc_enabled, disable_cart, scheduling_enabled,
                    add_card_to_wallet, emi_applicable, thumbnail_image, mobile_image,
                    base_image, small_image, brand_logo, tnc_link, tnc_content,
                    page_title, meta_title, meta_keywords, meta_description,
                    categories, themes, discounts, corporate_discounts,
                    related_products, redemption_rules, redemption_terms, cpg_type,
                    cpg_code, issuer_name, payout_enabled, payout_payment_methods,
                    payout_account_types, payout_transaction_types, max_beneficiaries,
                    validation_amount, edit_beneficiary, convenience_charge,
                    vpa_penny_drop_required, handling_charges, convenience_charges,
                    travel_pass, order_modes, reload_card_number, custom_themes_available,
                    store_locator_url, eta_message, status, sync_response
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    woohoo_product_id, sku.trim(), product_name, brand_name, brand_code, slug,
                    product_type, card_behaviour, description, short_description,
                    important_instructions, price_type, min_amount, max_amount,
                    currency_code, currency_symbol, currency_numeric_code, toJSONString(denominations),
                    expiry, kyc_enabled, disable_cart, scheduling_enabled,
                    add_card_to_wallet, emi_applicable, thumbnail_image, mobile_image,
                    base_image, small_image, brand_logo, tnc_link, tnc_content,
                    page_title, meta_title, meta_keywords, meta_description,
                    toJSONString(productCategories), toJSONString(themes), toJSONString(discounts), toJSONString(corporate_discounts),
                    toJSONString(related_products), toJSONString(redemption_rules), toJSONString(redemption_terms), cpg_type,
                    cpg_code, issuer_name, payout_enabled, toJSONString(payout_payment_methods),
                    toJSONString(payout_account_types), toJSONString(payout_transaction_types), max_beneficiaries,
                    validation_amount, edit_beneficiary, convenience_charge,
                    vpa_penny_drop_required, toJSONString(handling_charges), toJSONString(convenience_charges),
                    toJSONString(travel_pass), toJSONString(order_modes), reload_card_number, custom_themes_available,
                    store_locator_url, eta_message, status, toJSONString(sync_response)
                ]
            );
        }
    }
};

/**
 * Get active products for a category
 */
export const getProductsByCategoryFromDB = async (categoryId) => {
    // Look up the category in woohoo_categories to get the woohoo_category_id
    const [[category]] = await pool.query(
        'SELECT id, woohoo_category_id, name FROM woohoo_categories WHERE id = ? OR woohoo_category_id = ?',
        [categoryId, categoryId]
    );

    const targetId = category ? category.woohoo_category_id : categoryId;
    const targetIdStr = String(targetId);
    const targetIdNum = Number(targetId);

    // Query woohoo_products filtering on the JSON categories field
    // We check:
    // 1. Array of IDs: [54]
    // 2. Array of objects: [{"id": 54}]
    // 3. String array of IDs: ["54"]
    const [rows] = await pool.query(
        `SELECT id, sku, product_name, brand_name, thumbnail_image FROM woohoo_products 
         WHERE (
            JSON_CONTAINS(categories, CAST(? AS JSON)) OR 
            JSON_CONTAINS(categories, CAST(? AS JSON)) OR
            JSON_CONTAINS(categories, JSON_OBJECT('id', ?)) OR
            JSON_CONTAINS(categories, JSON_OBJECT('id', ?))
         ) AND status = 1 
         ORDER BY product_name ASC`,
        [targetIdNum, targetIdStr, targetIdNum, targetIdStr]
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
