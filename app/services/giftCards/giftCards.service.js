import pool from '../../config/dbConfig.js';
import fs from 'fs';
import { giftCardImageType, uploadFolders } from '../../config/constant/constant.js';

const toDbUsageType = (val) => {
    if (val === 1 || val === '1' || val === 'ONLINE') return 'ONLINE';
    if (val === 0 || val === '0' || val === 'OFFLINE') return 'OFFLINE';
    return 'ONLINE';
};

const toApiUsageType = (val) => {
    if (val === 'ONLINE') return 1;
    if (val === 'OFFLINE') return 0;
    if (val === 'BOTH') return 1; // Fallback both to online
    return 1;
};

const toTinyInt = (val) => {
    if (val === undefined || val === null) return 0;
    if (val === true || val === 'true' || val === 1 || val === '1') return 1;
    return 0;
};

/**
 * Fetch all gift cards (with store and grouped image details)
 */
export const getGiftCardsService = async () => {
    try {
        const [giftCards] = await pool.query(`
            SELECT gc.*, s.store_name 
            FROM gift_cards gc
            LEFT JOIN stores s ON gc.store_id = s.id
            ORDER BY gc.id DESC
        `);

        const [images] = await pool.query(`
            SELECT * FROM gift_card_images
        `);

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

            if (img.image_type === giftCardImageType.MOBILE) {
                imageMap[img.gift_card_id].mobile_images.push(imgData);
            } else if (img.image_type === giftCardImageType.DESKTOP) {
                imageMap[img.gift_card_id].desktop_images.push(imgData);
            }
        });

        giftCards.forEach(gc => {
            const grouped = imageMap[gc.id] || { mobile_images: [], desktop_images: [] };
            gc.mobile_images = grouped.mobile_images;
            gc.desktop_images = grouped.desktop_images;
            gc.usage_type = toApiUsageType(gc.usage_type);
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

            if (img.image_type === giftCardImageType.MOBILE) {
                mobile_images.push(imgData);
            } else if (img.image_type === giftCardImageType.DESKTOP) {
                desktop_images.push(imgData);
            }
        });

        giftCard.mobile_images = mobile_images;
        giftCard.desktop_images = desktop_images;
        giftCard.usage_type = toApiUsageType(giftCard.usage_type);

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
export const createGiftCardService = async (data, files) => {
    const {
        store_id, gift_card_name, sku, min_denomination, max_denomination,
        things_to_note, redeem_steps, usage_type, validity,
        partial_redemption, multiple_gift_cards_allowed, monthly_purchase_limit,
        discount_percentage, cashback_percentage, resell_allowed, resell_margin,
        status, mobile_images, desktop_images, woohoo_product_id
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

    // Verify Gift Card doesn't already exist for this store
    const [[existingGiftCard]] = await pool.query('SELECT id FROM gift_cards WHERE store_id = ?', [store_id]);
    if (existingGiftCard) {
        return {
            success: false,
            statusCode: 400,
            message: 'A gift card already exists for this store'
        };
    }

    let finalGiftCardName = gift_card_name;
    let finalSku = sku;
    let finalMin = min_denomination;
    let finalMax = max_denomination;
    let finalValidity = validity;
    let finalThingsToNote = things_to_note;
    let finalRedeemSteps = redeem_steps;

    let woohooProduct = null;

    // Verify Woohoo product exists and retrieve fields if provided
    if (woohoo_product_id) {
        const [[prod]] = await pool.query('SELECT * FROM woohoo_products WHERE id = ?', [woohoo_product_id]);
        if (!prod) {
            return {
                success: false,
                statusCode: 400,
                message: 'Selected Woohoo product not found'
            };
        }
        woohooProduct = prod;

        // Prefill missing / empty values
        if (!finalGiftCardName || finalGiftCardName.trim() === '') {
            finalGiftCardName = woohooProduct.name;
        }
        if (!finalSku || finalSku.trim() === '') {
            finalSku = woohooProduct.sku;
        }
        if (finalMin === undefined || finalMin === null || finalMin === '') {
            finalMin = woohooProduct.min_price;
        }
        if (finalMax === undefined || finalMax === null || finalMax === '') {
            finalMax = woohooProduct.max_price;
        }
        if (!finalValidity || finalValidity.trim() === '') {
            finalValidity = woohooProduct.expiry_info;
        }
        if (!finalThingsToNote || finalThingsToNote.trim() === '') {
            finalThingsToNote = woohooProduct.special_instruction;
        }
        if (!finalRedeemSteps || finalRedeemSteps.trim() === '') {
            finalRedeemSteps = woohooProduct.balance_enquiry_instruction;
        }
    }

    if (finalMin !== undefined && finalMax !== undefined && finalMin !== null && finalMax !== null && finalMin !== '' && finalMax !== '') {
        if (parseFloat(finalMin) > parseFloat(finalMax)) {
            return {
                success: false,
                statusCode: 400,
                message: 'Min denomination cannot be greater than max denomination'
            };
        }
    }

    // Verify SKU uniqueness
    if (finalSku) {
        const [[existingSku]] = await pool.query('SELECT id FROM gift_cards WHERE sku = ?', [finalSku.trim()]);
        if (existingSku) {
            return {
                success: false,
                statusCode: 400,
                message: 'Gift card SKU must be unique'
            };
        }
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // Let the primary key 'id' auto-increment
        const [result] = await connection.query(
            `INSERT INTO gift_cards (
                store_id, gift_card_name, sku, min_denomination, max_denomination,
                things_to_note, redeem_steps, usage_type, validity,
                partial_redemption, multiple_gift_cards_allowed, monthly_purchase_limit,
                discount_percentage, cashback_percentage, resell_allowed, resell_margin, status,
                woohoo_product_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                store_id,
                finalGiftCardName.trim(),
                finalSku ? finalSku.trim() : null,
                finalMin !== undefined && finalMin !== '' && finalMin !== null ? parseFloat(finalMin) : null,
                finalMax !== undefined && finalMax !== '' && finalMax !== null ? parseFloat(finalMax) : null,
                finalThingsToNote || null,
                finalRedeemSteps || null,
                toDbUsageType(usage_type),
                finalValidity ? finalValidity.trim() : null,
                toTinyInt(partial_redemption),
                toTinyInt(multiple_gift_cards_allowed),
                monthly_purchase_limit !== undefined && monthly_purchase_limit !== '' && monthly_purchase_limit !== null ? parseInt(monthly_purchase_limit) : null,
                discount_percentage !== undefined && discount_percentage !== '' && discount_percentage !== null ? parseFloat(discount_percentage) : null,
                cashback_percentage !== undefined && cashback_percentage !== '' && cashback_percentage !== null ? parseFloat(cashback_percentage) : null,
                toTinyInt(resell_allowed),
                resell_margin !== undefined && resell_margin !== '' && resell_margin !== null ? parseFloat(resell_margin) : 0.00,
                status !== undefined ? toTinyInt(status) : 1,
                woohoo_product_id ? parseInt(woohoo_product_id) : null
            ]
        );

        const giftCardId = result.insertId;

        // Gather and filter target image URLs (duplicate check)
        const imageInsertions = [];
        const insertedUrls = new Set();

        const addImage = (type, url) => {
            if (!url || typeof url !== 'string') return;
            const trimmedUrl = url.trim();
            if (trimmedUrl && !insertedUrls.has(trimmedUrl)) {
                insertedUrls.add(trimmedUrl);
                imageInsertions.push({
                    gift_card_id: giftCardId,
                    image_type: type,
                    image_url: trimmedUrl
                });
            }
        };

        // 1. Process Woohoo images if linked
        if (woohooProduct) {
            addImage(giftCardImageType.MOBILE, woohooProduct.image_mobile);
            addImage(giftCardImageType.DESKTOP, woohooProduct.image_base);
            addImage(giftCardImageType.DESKTOP, woohooProduct.image_small);
            addImage(giftCardImageType.DESKTOP, woohooProduct.image_thumbnail);
        }

        // 2. Process newly uploaded files via multer
        if (files) {
            if (files.mobile_images && files.mobile_images.length > 0) {
                files.mobile_images.forEach(file => {
                    addImage(giftCardImageType.MOBILE, `${uploadFolders.MOBILE_URL_PREFIX}/${file.filename}`);
                });
            }
            if (files.desktop_images && files.desktop_images.length > 0) {
                files.desktop_images.forEach(file => {
                    addImage(giftCardImageType.DESKTOP, `${uploadFolders.DESKTOP_URL_PREFIX}/${file.filename}`);
                });
            }
        }

        // 3. Process custom image URLs from JSON body
        const parseUrls = (imgField, type) => {
            if (!imgField) return;
            let list = [];
            if (typeof imgField === 'string') {
                try {
                    list = JSON.parse(imgField);
                } catch (e) {
                    list = imgField.split(',').map(u => u.trim());
                }
            } else if (Array.isArray(imgField)) {
                list = imgField;
            } else {
                list = [imgField];
            }

            list.forEach(urlObj => {
                let url = '';
                if (typeof urlObj === 'string') {
                    url = urlObj;
                } else if (urlObj && typeof urlObj === 'object') {
                    url = urlObj.image_url || urlObj.url || '';
                }
                addImage(type, url);
            });
        };

        parseUrls(mobile_images, giftCardImageType.MOBILE);
        parseUrls(desktop_images, giftCardImageType.DESKTOP);

        // Execute insertions in DB
        for (const img of imageInsertions) {
            await connection.query(
                `INSERT INTO gift_card_images (gift_card_id, image_type, image_url) VALUES (?, ?, ?)`,
                [img.gift_card_id, img.image_type, img.image_url]
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
 * Update an existing gift card supporting changing Woohoo selection and deleting/uploading images
 */
export const updateGiftCardService = async (id, body, files) => {
    const { mobile_images, desktop_images, deleted_image_ids, refresh_prefill, ...updateFields } = body;

    // Check if gift card exists
    const [[giftCard]] = await pool.query(
        'SELECT id, min_denomination, max_denomination, gift_card_name, sku, validity, things_to_note, redeem_steps, woohoo_product_id FROM gift_cards WHERE id = ?', 
        [id]
    );
    if (!giftCard) {
        return {
            success: false,
            statusCode: 404,
            message: 'Gift card not found'
        };
    }

    // Handle changing Woohoo product selection
    const woohooChanged = updateFields.woohoo_product_id !== undefined && 
        (updateFields.woohoo_product_id === null || updateFields.woohoo_product_id === '' 
            ? null 
            : parseInt(updateFields.woohoo_product_id)) !== (giftCard.woohoo_product_id ? parseInt(giftCard.woohoo_product_id) : null);

    let woohooProduct = null;
    if (updateFields.woohoo_product_id) {
        const [[prod]] = await pool.query('SELECT * FROM woohoo_products WHERE id = ?', [updateFields.woohoo_product_id]);
        if (!prod) {
            return {
                success: false,
                statusCode: 400,
                message: 'Selected Woohoo product not found'
            };
        }
        woohooProduct = prod;

        // Populate new values based on refresh_prefill configuration
        if (refresh_prefill === true || refresh_prefill === 'true') {
            if (updateFields.gift_card_name === undefined) updateFields.gift_card_name = woohooProduct.name;
            if (updateFields.sku === undefined) updateFields.sku = woohooProduct.sku;
            if (updateFields.min_denomination === undefined) updateFields.min_denomination = woohooProduct.min_price;
            if (updateFields.max_denomination === undefined) updateFields.max_denomination = woohooProduct.max_price;
            if (updateFields.validity === undefined) updateFields.validity = woohooProduct.expiry_info;
            if (updateFields.things_to_note === undefined) updateFields.things_to_note = woohooProduct.special_instruction;
            if (updateFields.redeem_steps === undefined) updateFields.redeem_steps = woohooProduct.balance_enquiry_instruction;
        } else {
            // Only populate currently empty fields
            if (updateFields.gift_card_name === undefined && !giftCard.gift_card_name) updateFields.gift_card_name = woohooProduct.name;
            if (updateFields.sku === undefined && !giftCard.sku) updateFields.sku = woohooProduct.sku;
            if (updateFields.min_denomination === undefined && giftCard.min_denomination === null) updateFields.min_denomination = woohooProduct.min_price;
            if (updateFields.max_denomination === undefined && giftCard.max_denomination === null) updateFields.max_denomination = woohooProduct.max_price;
            if (updateFields.validity === undefined && !giftCard.validity) updateFields.validity = woohooProduct.expiry_info;
            if (updateFields.things_to_note === undefined && !giftCard.things_to_note) updateFields.things_to_note = woohooProduct.special_instruction;
            if (updateFields.redeem_steps === undefined && !giftCard.redeem_steps) updateFields.redeem_steps = woohooProduct.balance_enquiry_instruction;
        }
    }

    const finalMin = updateFields.min_denomination !== undefined ? updateFields.min_denomination : giftCard.min_denomination;
    const finalMax = updateFields.max_denomination !== undefined ? updateFields.max_denomination : giftCard.max_denomination;

    if (finalMin !== null && finalMax !== null && finalMin !== undefined && finalMax !== undefined && finalMin !== '' && finalMax !== '') {
        if (parseFloat(finalMin) > parseFloat(finalMax)) {
            return {
                success: false,
                statusCode: 400,
                message: 'Min denomination cannot be greater than max denomination'
            };
        }
    }

    // Verify SKU uniqueness
    if (updateFields.sku !== undefined && updateFields.sku !== null && updateFields.sku !== '') {
        const skuVal = updateFields.sku.trim();
        const [[existingSku]] = await pool.query(
            'SELECT id FROM gift_cards WHERE sku = ? AND id != ?',
            [skuVal, id]
        );
        if (existingSku) {
            return {
                success: false,
                statusCode: 400,
                message: 'Gift card SKU must be unique'
            };
        }
        updateFields.sku = skuVal;
    }

    // Define allowed update keys
    const allowedFields = [
        'gift_card_name', 'sku', 'min_denomination', 'max_denomination',
        'things_to_note', 'redeem_steps', 'usage_type', 'validity',
        'partial_redemption', 'multiple_gift_cards_allowed', 'monthly_purchase_limit',
        'discount_percentage', 'cashback_percentage', 'resell_allowed', 'resell_margin',
        'status', 'woohoo_product_id'
    ];

    const keys = Object.keys(updateFields).filter(
        key => allowedFields.includes(key) && updateFields[key] !== undefined
    );

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // Execute main fields update
        if (keys.length > 0) {
            const setClause = keys.map(field => `${field} = ?`).join(', ');
            const values = keys.map(field => {
                const val = updateFields[field];
                if (val === '' || val === 'null' || val === null) return null;
                if (field === 'usage_type') {
                    return toDbUsageType(val);
                }
                if (['partial_redemption', 'multiple_gift_cards_allowed', 'resell_allowed', 'status'].includes(field)) {
                    return toTinyInt(val);
                }
                return val;
            });
            const updateQuery = `UPDATE gift_cards SET ${setClause} WHERE id = ?`;
            values.push(id);

            await connection.query(updateQuery, values);
        }

        // Process image updates
        // 1. Delete selected custom image records
        if (deleted_image_ids) {
            let idsToDelete = [];
            if (typeof deleted_image_ids === 'string') {
                try {
                    idsToDelete = JSON.parse(deleted_image_ids);
                } catch (e) {
                    idsToDelete = deleted_image_ids.split(',').map(idStr => parseInt(idStr.trim())).filter(val => !isNaN(val));
                }
            } else if (Array.isArray(deleted_image_ids)) {
                idsToDelete = deleted_image_ids.map(val => parseInt(val)).filter(val => !isNaN(val));
            } else if (typeof deleted_image_ids === 'number') {
                idsToDelete = [deleted_image_ids];
            }

            if (idsToDelete.length > 0) {
                const [imagesToDelete] = await connection.query(
                    'SELECT image_url FROM gift_card_images WHERE gift_card_id = ? AND id IN (?)',
                    [id, idsToDelete]
                );

                await connection.query(
                    'DELETE FROM gift_card_images WHERE gift_card_id = ? AND id IN (?)',
                    [id, idsToDelete]
                );

                // Delete physical uploaded files
                imagesToDelete.forEach(img => {
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
            }
        }

        // 2. If Woohoo selection changed, refresh/replace remote image links
        if (woohooChanged) {
            // Delete old remote URLs
            await connection.query(
                "DELETE FROM gift_card_images WHERE gift_card_id = ? AND (image_url LIKE 'http://%' OR image_url LIKE 'https://%')",
                [id]
            );

            // Populate new remote URLs
            if (woohooProduct) {
                const newWoohooImages = [];
                const insertedUrls = new Set();

                const addWoohooUrl = (type, url) => {
                    if (!url || typeof url !== 'string') return;
                    const trimmed = url.trim();
                    if (trimmed && !insertedUrls.has(trimmed)) {
                        insertedUrls.add(trimmed);
                        newWoohooImages.push({
                            gift_card_id: id,
                            image_type: type,
                            image_url: trimmed
                        });
                    }
                };

                addWoohooUrl(giftCardImageType.MOBILE, woohooProduct.image_mobile);
                addWoohooUrl(giftCardImageType.DESKTOP, woohooProduct.image_base);
                addWoohooUrl(giftCardImageType.DESKTOP, woohooProduct.image_small);
                addWoohooUrl(giftCardImageType.DESKTOP, woohooProduct.image_thumbnail);

                for (const img of newWoohooImages) {
                    await connection.query(
                        `INSERT INTO gift_card_images (gift_card_id, image_type, image_url) VALUES (?, ?, ?)`,
                        [img.gift_card_id, img.image_type, img.image_url]
                    );
                }
            }
        }

        // 3. Process and append newly uploaded custom images
        const imageInsertions = [];
        const insertedUrls = new Set();

        const addImage = (type, url) => {
            if (!url || typeof url !== 'string') return;
            const trimmed = url.trim();
            if (trimmed && !insertedUrls.has(trimmed)) {
                insertedUrls.add(trimmed);
                imageInsertions.push({
                    gift_card_id: id,
                    image_type: type,
                    image_url: trimmed
                });
            }
        };

        if (files) {
            if (files.mobile_images && files.mobile_images.length > 0) {
                files.mobile_images.forEach(file => {
                    addImage(giftCardImageType.MOBILE, `${uploadFolders.MOBILE_URL_PREFIX}/${file.filename}`);
                });
            }
            if (files.desktop_images && files.desktop_images.length > 0) {
                files.desktop_images.forEach(file => {
                    addImage(giftCardImageType.DESKTOP, `${uploadFolders.DESKTOP_URL_PREFIX}/${file.filename}`);
                });
            }
        }

        const parseUrls = (imgField, type) => {
            if (!imgField) return;
            let list = [];
            if (typeof imgField === 'string') {
                try {
                    list = JSON.parse(imgField);
                } catch (e) {
                    list = imgField.split(',').map(u => u.trim());
                }
            } else if (Array.isArray(imgField)) {
                list = imgField;
            } else {
                list = [imgField];
            }

            list.forEach(urlObj => {
                let url = '';
                if (typeof urlObj === 'string') {
                    url = urlObj;
                } else if (urlObj && typeof urlObj === 'object') {
                    url = urlObj.image_url || urlObj.url || '';
                }
                addImage(type, url);
            });
        };

        parseUrls(mobile_images, giftCardImageType.MOBILE);
        parseUrls(desktop_images, giftCardImageType.DESKTOP);

        for (const img of imageInsertions) {
            await connection.query(
                `INSERT INTO gift_card_images (gift_card_id, image_type, image_url) VALUES (?, ?, ?)`,
                [img.gift_card_id, img.image_type, img.image_url]
            );
        }

        await connection.commit();

        return {
            success: true,
            statusCode: 200,
            message: 'Gift card updated successfully',
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
