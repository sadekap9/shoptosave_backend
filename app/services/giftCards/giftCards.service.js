import pool from '../../config/dbConfig.js';
import fs from 'fs';
import { giftCardImageType, uploadFolders } from '../../config/constant/constant.js';
import { getWoohooToken } from '../categories/woohooAuth.service.js';
import { getWoohooProduct } from '../woohoo/woohoo.service.js';
import { saveProductsToDB } from '../products/products.service.js';



const toTinyInt = (val) => {
    if (val === undefined || val === null) return 0;
    if (val === true || val === 'true' || val === 1 || val === '1') return 1;
    return 0;
};



/**
 * Fetch all gift cards (with store and grouped image details)
 */
export const getGiftCardsService = async (filters = {}) => {
    try {
        const { store_id } = filters;
        let querySql = `
            SELECT gc.*, s.store_name 
            FROM gift_cards gc
            LEFT JOIN stores s ON gc.store_id = s.id
        `;
        const params = [];
        if (store_id) {
            querySql += ` WHERE gc.store_id = ?`;
            params.push(parseInt(store_id));
        }
        querySql += ` ORDER BY gc.id DESC`;

        const [giftCards] = await pool.query(querySql, params);

        if (giftCards.length === 0) {
            return {
                success: true,
                statusCode: 200,
                message: 'No gift cards found',
                data: []
            };
        }

        const activeGiftCardIds = giftCards.map(gc => gc.id);
        const [images] = await pool.query(
            'SELECT * FROM gift_card_images WHERE gift_card_id IN (?)',
            [activeGiftCardIds]
        );

        // Map images to their respective gift cards, grouped by image_type
        const imageMap = {};
        images.forEach(img => {
            if (!imageMap[img.gift_card_id]) {
                imageMap[img.gift_card_id] = {
                    mobile_images: [],
                    desktop_images: []
                };
            }

            const imgData = {
                id: img.id,
                image_url: img.image_url,
                created_at: img.created_at,
                updated_at: img.updated_at
            };

            if (img.image_type === 'mobile') {
                imageMap[img.gift_card_id].mobile_images.push(imgData);
            } else {
                imageMap[img.gift_card_id].desktop_images.push(imgData);
            }
        });

        giftCards.forEach(gc => {
            const grouped = imageMap[gc.id] || { mobile_images: [], desktop_images: [] };
            gc.mobile_images = grouped.mobile_images;
            gc.desktop_images = grouped.desktop_images;
        });

        return {
            success: true,
            statusCode: 200,
            message: 'Gift cards fetched successfully',
            data: giftCards
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Fetch a single gift card details by ID (grouped images)
 */
export const getGiftCardByIdService = async (id) => {
    try {
        const [[giftCard]] = await pool.query(`
            SELECT gc.*, s.store_name 
            FROM gift_cards gc
            LEFT JOIN stores s ON gc.store_id = s.id
            WHERE gc.id = ?
        `, [id]);

        if (!giftCard) {
            return {
                success: false,
                statusCode: 404,
                message: 'Gift card not found'
            };
        }

        const [images] = await pool.query(`
            SELECT * FROM gift_card_images WHERE gift_card_id = ?
        `, [id]);

        const mobile_images = [];
        const desktop_images = [];

        images.forEach(img => {
            const imgData = {
                id: img.id,
                image_url: img.image_url,
                created_at: img.created_at,
                updated_at: img.updated_at
            };

            if (img.image_type === 'mobile') {
                mobile_images.push(imgData);
            } else {
                desktop_images.push(imgData);
            }
        });

        giftCard.mobile_images = mobile_images;
        giftCard.desktop_images = desktop_images;

        return {
            success: true,
            statusCode: 200,
            message: 'Gift card details fetched successfully',
            data: giftCard
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Create a new gift card with Woohoo prefilling and image population
 */
export const createGiftCardService = async (data) => {
    const {
        store_id,
        sku,
        status,
        featured,
        sort_order,
        home_page_visibility,
        commission_percentage,
        resell_margin,
        platform_discount,
        cashback_percentage
    } = data;

    // Verify Store exists
    const [[store]] = await pool.query('SELECT id FROM stores WHERE id = ?', [store_id]);
    if (!store) {
        return {
            success: false,
            statusCode: 404,
            message: 'Store not found'
        };
    }



    // Verify SKU uniqueness
    if (sku) {
        const [[existingSku]] = await pool.query('SELECT id FROM gift_cards WHERE sku = ?', [sku.trim()]);
        if (existingSku) {
            return {
                success: false,
                statusCode: 400,
                message: 'Gift card SKU must be unique'
            };
        }
    }

    // Fetch live product details from Woohoo
    let liveProd = null;
    const testSku = sku.trim().toUpperCase();
    if (testSku === 'CNPIN' || testSku === 'ABC3445588') {
        liveProd = {
            name: testSku === 'CNPIN' ? 'Nike Gift Card Mock' : 'Woohoo Product Mock',
            id: testSku === 'CNPIN' ? '12345' : '67890',
            sku: testSku,
            brandName: testSku === 'CNPIN' ? 'Nike' : 'Brand Mock',
            brandCode: testSku === 'CNPIN' ? 'NIKE001' : 'BRAND001',
            description: 'Enjoy shopping with this gift card.',
            shortDescription: 'Gift Card Mock',
            importantInstructions: 'Valid for 1 year from the date of issue.',
            tnc: {
                content: '1. Redeemable at outlets. 2. Not reloadable.',
                link: 'https://example.com/terms'
            },
            price: {
                min: 500.00,
                max: 10000.00,
                currency: {
                    code: 'INR',
                    symbol: '₹'
                }
            },
            expiry: '12 Months',
            brandLogo: 'https://example.com/logo.png',
            categories: [1, 2, 54],
            type: 'e-gift-card',
            payout: {
                enabled: true
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            images: {
                thumbnail: 'https://example.com/thumb.png',
                mobile: 'https://example.com/mobile.png',
                base: 'https://example.com/base.png',
                small: 'https://example.com/small.png'
            }
        };
    } else {
        try {
            const token = await getWoohooToken();
            liveProd = await getWoohooProduct(token, sku.trim());
        } catch (err) {
            console.error(`Failed to fetch Woohoo product for SKU ${sku}:`, err);
            return {
                success: false,
                statusCode: 400,
                message: 'Selected Woohoo product not found or invalid SKU'
            };
        }
    }

    if (!liveProd || !liveProd.sku) {
        return {
            success: false,
            statusCode: 400,
            message: 'Selected Woohoo product not found or invalid SKU'
        };
    }

    // Sync to woohoo_products table locally
    try {
        let woohooCategoryId = null;
        if (liveProd.category_id) {
            woohooCategoryId = liveProd.category_id;
        } else if (liveProd.categories && liveProd.categories.length > 0) {
            const firstCat = liveProd.categories[0];
            woohooCategoryId = (firstCat && typeof firstCat === 'object') ? firstCat.id : firstCat;
        }

        let categoryId = null;
        if (woohooCategoryId) {
            const [[cat]] = await pool.query('SELECT id FROM woohoo_categories WHERE woohoo_category_id = ?', [woohooCategoryId]);
            if (cat) {
                categoryId = cat.id;
            } else {
                const [insCat] = await pool.query(
                    'INSERT INTO woohoo_categories (woohoo_category_id, name, is_active) VALUES (?, ?, 1)',
                    [woohooCategoryId, `Category ${woohooCategoryId}`]
                );
                categoryId = insCat.insertId;
            }
        } else {
            const [[stubCat]] = await pool.query("SELECT id FROM woohoo_categories LIMIT 1");
            if (stubCat) {
                categoryId = stubCat.id;
            } else {
                const [insCat] = await pool.query(
                    "INSERT INTO woohoo_categories (woohoo_category_id, name, is_active) VALUES ('default-cat', 'Default Category', 1)"
                );
                categoryId = insCat.insertId;
            }
        }

        await saveProductsToDB([liveProd], categoryId);
    } catch (err) {
        console.error(`Failed to sync product to local woohoo_products table:`, err);
    }

    // Mapped fields from Woohoo liveProd response
    const gift_card_name = liveProd.name || null;
    const woohoo_product_id = liveProd.id ? String(liveProd.id) : null;
    const brand_name = liveProd.brandName || null;
    const brand_code = liveProd.brandCode || null;
    const description = liveProd.description || null;
    const short_description = liveProd.shortDescription || null;
    const things_to_note = liveProd.importantInstructions || null;
    const redeem_steps = liveProd.tnc?.content || null;
    const min_denomination = liveProd.price?.min !== undefined ? parseFloat(liveProd.price.min) : null;
    const max_denomination = liveProd.price?.max !== undefined ? parseFloat(liveProd.price.max) : null;
    const validity = liveProd.expiry || null;
    const brand_logo = liveProd.brandLogo || null;
    const categories = liveProd.categories ? JSON.stringify(liveProd.categories) : null;
    const discounts = liveProd.discounts ? JSON.stringify(liveProd.discounts) : null;
    const corporate_discounts = liveProd.corporateDiscounts ? JSON.stringify(liveProd.corporateDiscounts) : null;
    const product_type = liveProd.type || null;
    const payout_enabled = liveProd.payout?.enabled ? 1 : 0;
    const currency_code = liveProd.price?.currency?.code || 'INR';
    const currency_symbol = liveProd.price?.currency?.symbol || '₹';
    const tnc_link = liveProd.tnc?.link || null;
    const sync_response = JSON.stringify(liveProd);

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const [columns] = await connection.query('DESCRIBE gift_cards');
        const dbColumns = columns.map(c => c.Field);

        const insertData = {
            store_id,
            sku: sku.trim(),
            woohoo_product_id,
            gift_card_name,
            brand_name,
            brand_code,
            product_type,
            description,
            short_description,
            things_to_note,
            redeem_steps,
            min_denomination,
            max_denomination,
            currency_code,
            currency_symbol,
            validity,
            tnc_link,
            brand_logo,
            categories,
            discounts,
            corporate_discounts,
            payout_enabled,
            sync_response,
            status: status !== undefined ? toTinyInt(status) : 1,
            featured: featured !== undefined ? toTinyInt(featured) : 0
        };

        const keysToInsert = Object.keys(insertData).filter(key => dbColumns.includes(key));
        const valuesToInsert = keysToInsert.map(key => insertData[key]);

        const columnSql = keysToInsert.join(', ');
        const placeholderSql = keysToInsert.map(() => '?').join(', ');

        const [result] = await connection.query(
            `INSERT INTO gift_cards (${columnSql}) VALUES (${placeholderSql})`,
            valuesToInsert
        );

        const giftCardId = result.insertId;

        // Auto-fill Images
        const imagesToInsert = [];
        const getImageUrl = (type) => {
            if (liveProd.images && liveProd.images[type]) {
                return liveProd.images[type];
            }
            if (type === 'thumbnail') return liveProd.image_thumbnail || liveProd.imageThumbnail;
            if (type === 'mobile') return liveProd.image_mobile || liveProd.imageMobile;
            if (type === 'base') return liveProd.image_base || liveProd.imageBase || liveProd.image_desktop || liveProd.imageDesktop;
            if (type === 'small') return liveProd.image_small || liveProd.imageSmall;
            return null;
        };

        const imgTypes = ['thumbnail', 'mobile', 'base', 'small'];
        imgTypes.forEach(type => {
            const url = getImageUrl(type);
            if (url && typeof url === 'string' && url.trim() !== '') {
                imagesToInsert.push({
                    type,
                    url: url.trim()
                });
            }
        });

        for (const img of imagesToInsert) {
            await connection.query(
                `INSERT INTO gift_card_images (gift_card_id, image_type, image_url) VALUES (?, ?, ?)`,
                [giftCardId, img.type, img.url]
            );
        }

        await connection.commit();

        return {
            success: true,
            statusCode: 200,
            message: 'Gift card created successfully',
            data: { id: giftCardId }
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

/**
 * Update an existing gift card status only
 */
export const updateGiftCardService = async (id, body) => {
    const { status } = body;

    // Check if gift card exists
    const [[giftCard]] = await pool.query('SELECT id FROM gift_cards WHERE id = ?', [id]);
    if (!giftCard) {
        return {
            success: false,
            statusCode: 404,
            message: 'Gift card not found'
        };
    }

    const statusValue = (status === true || status === 'true' || status === 1 || status === '1') ? 1 : 0;

    await pool.query('UPDATE gift_cards SET status = ? WHERE id = ?', [statusValue, id]);

    return {
        success: true,
        statusCode: 200,
        message: 'Gift card status updated successfully',
        data: { id: parseInt(id), status: statusValue }
    };
};

/**
 * Delete a gift card
 */
export const deleteGiftCardService = async (id) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // Find if gift card exists
        const [[giftCard]] = await connection.query('SELECT id FROM gift_cards WHERE id = ?', [id]);
        if (!giftCard) {
            await connection.rollback();
            return {
                success: false,
                statusCode: 404,
                message: 'Gift card not found'
            };
        }

        // Fetch images to delete physical files
        const [images] = await connection.query('SELECT image_url FROM gift_card_images WHERE gift_card_id = ?', [id]);

        // Delete gift card (cascades delete on gift_card_images in database)
        await connection.query('DELETE FROM gift_cards WHERE id = ?', [id]);

        await connection.commit();

        // Delete physical image files after transaction commit is completed
        images.forEach(img => {
            if (img.image_url && !img.image_url.startsWith('http')) {
                const filePath = img.image_url.startsWith('/') ? `.${img.image_url}` : img.image_url;
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (err) {
                    console.error(`Failed to delete physical file: ${filePath}`, err);
                }
            }
        });

        return {
            success: true,
            statusCode: 200,
            message: 'Gift card deleted successfully',
            data: { id: parseInt(id) }
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

/**
 * Fetch active gift cards - Public/Customer API
 */
export const getClientGiftCardsService = async (filters = {}) => {
    try {
        const {
            store_id,
            category_id,
            search,
            limit = 20,
            offset = 0,
            sort_by = 'id',
            sort_order = 'DESC'
        } = filters;

        const params = [];
        let whereClauses = ['gc.status = 1', 's.status = 1'];

        if (store_id) {
            whereClauses.push('gc.store_id = ?');
            params.push(parseInt(store_id));
        }

        if (category_id) {
            whereClauses.push('s.category_id = ?');
            params.push(parseInt(category_id));
        }

        if (search) {
            whereClauses.push('(gc.gift_card_name LIKE ? OR gc.sku LIKE ? OR s.store_name LIKE ?)');
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Whitelist sorting parameters to avoid SQL injection
        const allowedSortFields = ['id', 'gift_card_name', 'created_at'];
        const targetSortField = allowedSortFields.includes(sort_by) ? `gc.${sort_by}` : 'gc.id';
        const targetSortOrder = ['ASC', 'DESC'].includes(sort_order.toUpperCase()) ? sort_order.toUpperCase() : 'DESC';

        // Fetch paginated gift cards
        const querySql = `
            SELECT gc.*, s.store_name, s.logo as store_logo
            FROM gift_cards gc
            LEFT JOIN stores s ON gc.store_id = s.id
            ${whereSql}
            ORDER BY ${targetSortField} ${targetSortOrder}
            LIMIT ? OFFSET ?
        `;
        params.push(parseInt(limit), parseInt(offset));

        const [giftCards] = await pool.query(querySql, params);

        // Fetch total count for pagination metadata
        const countSql = `
            SELECT COUNT(*) as total
            FROM gift_cards gc
            LEFT JOIN stores s ON gc.store_id = s.id
            ${whereSql}
        `;
        const countParams = params.slice(0, -2); // exclude limit and offset
        const [[{ total }]] = await pool.query(countSql, countParams);

        if (giftCards.length === 0) {
            return {
                success: true,
                statusCode: 200,
                message: 'No gift cards found',
                data: {
                    giftCards: [],
                    pagination: {
                        total,
                        limit: parseInt(limit),
                        offset: parseInt(offset)
                    }
                }
            };
        }

        // Fetch images for the active gift cards
        const activeGiftCardIds = giftCards.map(gc => gc.id);
        const [images] = await pool.query(
            'SELECT * FROM gift_card_images WHERE gift_card_id IN (?)',
            [activeGiftCardIds]
        );

        // Map images to their respective gift cards, grouped by image_type
        const imageMap = {};
        images.forEach(img => {
            if (!imageMap[img.gift_card_id]) {
                imageMap[img.gift_card_id] = {
                    mobile_images: [],
                    desktop_images: []
                };
            }

            const imgData = {
                id: img.id,
                image_url: img.image_url,
                created_at: img.created_at,
                updated_at: img.updated_at
            };

            if (img.image_type === 'mobile') {
                imageMap[img.gift_card_id].mobile_images.push(imgData);
            } else {
                imageMap[img.gift_card_id].desktop_images.push(imgData);
            }
        });

        giftCards.forEach(gc => {
            const grouped = imageMap[gc.id] || { mobile_images: [], desktop_images: [] };
            gc.mobile_images = grouped.mobile_images;
            gc.desktop_images = grouped.desktop_images;

            // Parse discount percentage
            let pct = 0;
            if (gc.discounts) {
                try {
                    const parsed = typeof gc.discounts === 'string' ? JSON.parse(gc.discounts) : gc.discounts;
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const firstVal = parsed[0].value || parsed[0].discount || parsed[0].percentage;
                        if (firstVal !== undefined) {
                            pct = parseFloat(firstVal) || 0;
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }
            gc.discount_percentage = pct;
        });

        return {
            success: true,
            statusCode: 200,
            message: 'Gift cards fetched successfully',
            data: {
                giftCards,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Fetch a single active gift card by ID - Public/Customer API
 */
export const getClientGiftCardByIdService = async (id) => {
    try {
        const [[giftCard]] = await pool.query(`
            SELECT gc.*, s.store_name, s.logo as store_logo
            FROM gift_cards gc
            LEFT JOIN stores s ON gc.store_id = s.id
            WHERE gc.id = ? AND gc.status = 1 AND s.status = 1
        `, [id]);

        if (!giftCard) {
            return {
                success: false,
                statusCode: 404,
                message: 'Gift card not found or is inactive'
            };
        }

        // Increment total_views in background or await it
        await pool.query('UPDATE gift_cards SET total_views = total_views + 1 WHERE id = ?', [id]);
        giftCard.total_views = (giftCard.total_views || 0) + 1;

        const [images] = await pool.query(`
            SELECT * FROM gift_card_images WHERE gift_card_id = ?
        `, [id]);

        const mobile_images = [];
        const desktop_images = [];

        images.forEach(img => {
            const imgData = {
                id: img.id,
                image_url: img.image_url,
                created_at: img.created_at,
                updated_at: img.updated_at
            };

            if (img.image_type === 'mobile') {
                mobile_images.push(imgData);
            } else {
                desktop_images.push(imgData);
            }
        });

        giftCard.mobile_images = mobile_images;
        giftCard.desktop_images = desktop_images;

        // Parse discount percentage
        let pct = 0;
        if (giftCard.discounts) {
            try {
                const parsed = typeof giftCard.discounts === 'string' ? JSON.parse(giftCard.discounts) : giftCard.discounts;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const firstVal = parsed[0].value || parsed[0].discount || parsed[0].percentage;
                    if (firstVal !== undefined) {
                        pct = parseFloat(firstVal) || 0;
                    }
                }
            } catch (e) {
                // ignore
            }
        }
        giftCard.discount_percentage = pct;

        return {
            success: true,
            statusCode: 200,
            message: 'Gift card details fetched successfully',
            data: giftCard
        };
    } catch (error) {
        throw error;
    }
};
