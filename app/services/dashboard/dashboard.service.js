import pool from '../../config/dbConfig.js';

/**
 * Fetch active, scheduled banners (max 3)
 */
const getBanners = async () => {
    const [rows] = await pool.query(`
        SELECT 
            id, banner_name, title, highlighted_text, subtitle, offer_text,
            banner_image, background_color, primary_button_text, primary_button_link,
            secondary_button_text, secondary_button_link, banner_type, redirect_type,
            redirect_value, display_order
        FROM banners
        WHERE status = 1
          AND (start_date IS NULL OR start_date <= NOW())
          AND (end_date IS NULL OR end_date >= NOW())
        ORDER BY display_order ASC
        LIMIT 3
    `);
    return rows;
};

/**
 * Fetch trending gift cards by total_views (max 10)
 */
const getTrendingGiftCards = async () => {
    const [giftCards] = await pool.query(`
        SELECT 
            gc.id, gc.gift_card_name, gc.brand_name, gc.brand_logo,
            COALESCE(
                CAST(JSON_UNQUOTE(JSON_EXTRACT(gc.discounts, '$[0].value')) AS DECIMAL(5,2)),
                CAST(JSON_UNQUOTE(JSON_EXTRACT(gc.discounts, '$[0].discount')) AS DECIMAL(5,2)),
                CAST(JSON_UNQUOTE(JSON_EXTRACT(gc.discounts, '$[0].percentage')) AS DECIMAL(5,2)),
                0.00
            ) AS discount_percentage,
            gc.total_views,
            gc.discounts
        FROM gift_cards gc
        WHERE gc.status = 1
        ORDER BY gc.total_views DESC, gc.id DESC
        LIMIT 10
    `);

    if (giftCards.length === 0) return [];

    // Fetch primary image for each gift card in a single query
    const ids = giftCards.map(gc => gc.id);
    const [images] = await pool.query(
        `SELECT gift_card_id, image_url, image_type
         FROM gift_card_images
         WHERE gift_card_id IN (?)
         ORDER BY id ASC`,
        [ids]
    );

    // Map first image per gift card
    const imageMap = {};
    images.forEach(img => {
        if (!imageMap[img.gift_card_id]) {
            imageMap[img.gift_card_id] = img.image_url;
        }
    });

    return giftCards.map(gc => {
        let pct = parseFloat(gc.discount_percentage) || 0;
        if (pct === 0 && gc.discounts) {
            try {
                const parsed = typeof gc.discounts === 'string' ? JSON.parse(gc.discounts) : gc.discounts;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const firstVal = parsed[0].value || parsed[0].discount || parsed[0].percentage;
                    if (firstVal !== undefined) {
                        pct = parseFloat(firstVal) || 0;
                    }
                }
            } catch (e) {
                // ignore parsing errors
            }
        }

        const { discounts, ...cleanGc } = gc;
        return {
            ...cleanGc,
            discount_percentage: pct,
            primary_image: imageMap[gc.id] || null
        };
    });
};

/**
 * Fetch top discounted gift cards (max 10)
 */
const getTopDiscountedGiftCards = async () => {
    const [giftCards] = await pool.query(`
        SELECT 
            gc.id, gc.gift_card_name, gc.brand_name, gc.brand_logo,
            COALESCE(
                CAST(JSON_UNQUOTE(JSON_EXTRACT(gc.discounts, '$[0].value')) AS DECIMAL(5,2)),
                CAST(JSON_UNQUOTE(JSON_EXTRACT(gc.discounts, '$[0].discount')) AS DECIMAL(5,2)),
                CAST(JSON_UNQUOTE(JSON_EXTRACT(gc.discounts, '$[0].percentage')) AS DECIMAL(5,2)),
                0.00
            ) AS discount_percentage,
            gc.discounts
        FROM gift_cards gc
        WHERE gc.status = 1
        HAVING discount_percentage > 0
        ORDER BY discount_percentage DESC, gc.id DESC
        LIMIT 10
    `);

    if (giftCards.length === 0) return [];

    // Fetch primary image for each gift card in a single query
    const ids = giftCards.map(gc => gc.id);
    const [images] = await pool.query(
        `SELECT gift_card_id, image_url, image_type
         FROM gift_card_images
         WHERE gift_card_id IN (?)
         ORDER BY id ASC`,
        [ids]
    );

    // Map first image per gift card
    const imageMap = {};
    images.forEach(img => {
        if (!imageMap[img.gift_card_id]) {
            imageMap[img.gift_card_id] = img.image_url;
        }
    });

    return giftCards.map(gc => {
        let pct = parseFloat(gc.discount_percentage) || 0;
        if (pct === 0 && gc.discounts) {
            try {
                const parsed = typeof gc.discounts === 'string' ? JSON.parse(gc.discounts) : gc.discounts;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const firstVal = parsed[0].value || parsed[0].discount || parsed[0].percentage;
                    if (firstVal !== undefined) {
                        pct = parseFloat(firstVal) || 0;
                    }
                }
            } catch (e) {
                // ignore parsing errors
            }
        }

        const { discounts, ...cleanGc } = gc;
        return {
            ...cleanGc,
            discount_percentage: pct,
            primary_image: imageMap[gc.id] || null
        };
    });
};

/**
 * Dashboard Service — runs all 3 sections in parallel
 */
export const getDashboardService = async () => {
    const [banners, trendingGiftCards, topDiscountedGiftCards] = await Promise.all([
        getBanners(),
        getTrendingGiftCards(),
        getTopDiscountedGiftCards()
    ]);

    return {
        success: true,
        statusCode: 200,
        message: 'Dashboard fetched successfully',
        data: {
            banners,
            trending_gift_cards: trendingGiftCards,
            top_discounted_gift_cards: topDiscountedGiftCards
        }
    };
};
