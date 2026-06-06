import pool from '../../config/dbConfig.js';
import fs from 'fs';
import { giftCardImageType, uploadFolders, UsageType } from '../../config/constant/constant.js';

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
 * Create a new gift card
 */
export const createGiftCardService = async (data, files) => {
    const {
        store_id, gift_card_name, sku, min_denomination, max_denomination,
        things_to_note, redeem_steps, usage_type, validity,
        partial_redemption, multiple_gift_cards_allowed, monthly_purchase_limit,
        discount_percentage, cashback_percentage, resell_allowed, resell_margin,
        status, mobile_images, desktop_images
    } = data;

    if (min_denomination !== undefined && max_denomination !== undefined && min_denomination !== null && max_denomination !== null && min_denomination !== '' && max_denomination !== '') {
        if (parseFloat(min_denomination) > parseFloat(max_denomination)) {
            return {
                success: false,
                statusCode: 400,
                message: 'Min denomination cannot be greater than max denomination'
            };
        }
    }

    // Check if store exists
    const [[store]] = await pool.query('SELECT id FROM stores WHERE id = ?', [store_id]);
    if (!store) {
        return {
            success: false,
            statusCode: 400,
            message: 'Store not found'
        };
    }

    // Check if a gift card already exists for this store
    const [[existingGiftCard]] = await pool.query('SELECT id FROM gift_cards WHERE id = ?', [store_id]);
    if (existingGiftCard) {
        return {
            success: false,
            statusCode: 400,
            message: 'A gift card already exists for this store'
        };
    }

    // Check if SKU is unique (if provided)
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

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // Since primary key 'id' references 'stores(id)', we must explicitly insert id = store_id
        await connection.query(
            `INSERT INTO gift_cards (
                id, store_id, gift_card_name, sku, min_denomination, max_denomination,
                things_to_note, redeem_steps, usage_type, validity,
                partial_redemption, multiple_gift_cards_allowed, monthly_purchase_limit,
                discount_percentage, cashback_percentage, resell_allowed, resell_margin, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                store_id,
                store_id,
                gift_card_name.trim(),
                sku ? sku.trim() : null,
                min_denomination !== undefined && min_denomination !== '' && min_denomination !== null ? parseFloat(min_denomination) : null,
                max_denomination !== undefined && max_denomination !== '' && max_denomination !== null ? parseFloat(max_denomination) : null,
                things_to_note || null,
                redeem_steps || null,
                toDbUsageType(usage_type),
                validity ? validity.trim() : null,
                toTinyInt(partial_redemption),
                toTinyInt(multiple_gift_cards_allowed),
                monthly_purchase_limit !== undefined && monthly_purchase_limit !== '' && monthly_purchase_limit !== null ? parseInt(monthly_purchase_limit) : null,
                discount_percentage !== undefined && discount_percentage !== '' && discount_percentage !== null ? parseFloat(discount_percentage) : null,
                cashback_percentage !== undefined && cashback_percentage !== '' && cashback_percentage !== null ? parseFloat(cashback_percentage) : null,
                toTinyInt(resell_allowed),
                resell_margin !== undefined && resell_margin !== '' && resell_margin !== null ? parseFloat(resell_margin) : 0.00,
                status !== undefined ? toTinyInt(status) : 1
            ]
        );

        // Process images
        const imageInsertions = [];

        // 1. Process files from multer fields
        if (files) {
            if (files.mobile_images && files.mobile_images.length > 0) {
                files.mobile_images.forEach(file => {
                    imageInsertions.push({
                        gift_card_id: store_id,
                        image_type: giftCardImageType.MOBILE,
                        image_url: `${uploadFolders.MOBILE_URL_PREFIX}/${file.filename}`
                    });
                });
            }
            if (files.desktop_images && files.desktop_images.length > 0) {
                files.desktop_images.forEach(file => {
                    imageInsertions.push({
                        gift_card_id: store_id,
                        image_type: giftCardImageType.DESKTOP,
                        image_url: `${uploadFolders.DESKTOP_URL_PREFIX}/${file.filename}`
                    });
                });
            }
        }

        // 2. Process image URLs from request body (JSON)
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
                if (url) {
                    imageInsertions.push({
                        gift_card_id: store_id,
                        image_type: type,
                        image_url: url.trim()
                    });
                }
            });
        };

        parseUrls(mobile_images, giftCardImageType.MOBILE);
        parseUrls(desktop_images, giftCardImageType.DESKTOP);

        // Execute image insertions
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
            data: { id: store_id }
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

/**
 * Update an existing gift card
 */
export const updateGiftCardService = async (id, body, files) => {
    const { mobile_images, desktop_images, deleted_image_ids, ...updateFields } = body;

    // Check if gift card exists
    const [[giftCard]] = await pool.query('SELECT id, min_denomination, max_denomination FROM gift_cards WHERE id = ?', [id]);
    if (!giftCard) {
        return {
            success: false,
            statusCode: 404,
            message: 'Gift card not found'
        };
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

    // Define allowed fields
    const allowedFields = [
        'store_id', 'gift_card_name', 'sku', 'min_denomination', 'max_denomination',
        'things_to_note', 'redeem_steps', 'usage_type', 'validity',
        'partial_redemption', 'multiple_gift_cards_allowed', 'monthly_purchase_limit',
        'discount_percentage', 'cashback_percentage', 'resell_allowed', 'resell_margin',
        'status'
    ];

    // Filter keys
    const keys = Object.keys(updateFields).filter(
        key => allowedFields.includes(key) && updateFields[key] !== undefined
    );

    // If store_id is updated, verify it
    if (keys.includes('store_id')) {
        const newStoreId = updateFields.store_id;
        const [[store]] = await pool.query('SELECT id FROM stores WHERE id = ?', [newStoreId]);
        if (!store) {
            return {
                success: false,
                statusCode: 400,
                message: 'Store not found'
            };
        }
        if (parseInt(newStoreId) !== parseInt(id)) {
            return {
                success: false,
                statusCode: 400,
                message: 'Changing store_id is not allowed. Please delete and recreate the gift card.'
            };
        }
    }

    // Check SKU uniqueness
    if (keys.includes('sku') && updateFields.sku) {
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

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
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

        // 1. Handle image deletions (if list of specific deleted image IDs is passed)
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
                // Fetch image URLs first to delete physical files
                const [imagesToDelete] = await connection.query(
                    'SELECT image_url FROM gift_card_images WHERE gift_card_id = ? AND id IN (?)',
                    [id, idsToDelete]
                );

                // Delete from DB
                await connection.query(
                    'DELETE FROM gift_card_images WHERE gift_card_id = ? AND id IN (?)',
                    [id, idsToDelete]
                );

                // Delete physical files
                imagesToDelete.forEach(img => {
                    if (img.image_url) {
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

        const imageInsertions = [];

        // 2. Process newly uploaded files from fields
        if (files) {
            if (files.mobile_images && files.mobile_images.length > 0) {
                files.mobile_images.forEach(file => {
                    imageInsertions.push({
                        gift_card_id: id,
                        image_type: giftCardImageType.MOBILE,
                        image_url: `${uploadFolders.MOBILE_URL_PREFIX}/${file.filename}`
                    });
                });
            }
            if (files.desktop_images && files.desktop_images.length > 0) {
                files.desktop_images.forEach(file => {
                    imageInsertions.push({
                        gift_card_id: id,
                        image_type: giftCardImageType.DESKTOP,
                        image_url: `${uploadFolders.DESKTOP_URL_PREFIX}/${file.filename}`
                    });
                });
            }
        }

        // 3. Process image URLs from request body (JSON)
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
                if (url) {
                    imageInsertions.push({
                        gift_card_id: id,
                        image_type: type,
                        image_url: url.trim()
                    });
                }
            });
        };

        parseUrls(mobile_images, giftCardImageType.MOBILE);
        parseUrls(desktop_images, giftCardImageType.DESKTOP);

        // Insert new images
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
            if (img.image_url) {
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
