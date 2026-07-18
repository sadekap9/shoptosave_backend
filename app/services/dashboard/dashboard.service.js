import pool from '../../config/dbConfig.js';
import { getApplicableOffer } from '../offers/offers.service.js';
import { OFFER_TYPE } from '../../config/constant/constant.js';

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
 * Fetch top 6 trending gift cards by total_views
 */
const getTrendingGiftCards = async () => {
    const [rows] = await pool.query(`
        SELECT gc.id, gc.gift_card_image, gc.store_id
        FROM gift_cards gc
        WHERE gc.status = 1
        ORDER BY gc.total_views DESC, gc.id DESC
        LIMIT 6
    `);

    if (rows.length === 0) return [];

    return await Promise.all(
        rows.map(async (gc) => {
            const applicableOffer = await getApplicableOffer(gc.id);
            const valNum = applicableOffer ? parseFloat(applicableOffer.value) : 0;
            const offerTypeNum = applicableOffer ? Number(applicableOffer.offer_type) : 1;

            let display_text = '0%';
            if (applicableOffer) {
                display_text = offerTypeNum === OFFER_TYPE.INSTANT_DISCOUNT
                    ? `${valNum}% OFF`
                    : `${valNum}% Cashback`;
            }

            return {
                id: gc.id,
                gift_card_image: gc.gift_card_image || null,
                offer_type: offerTypeNum,
                discount_percentage: valNum,
                display_text
            };
        })
    );
};

/**
 * Fetch 6 highest discount gift cards
 */
const getTopDiscountedGiftCards = async () => {
    const [rows] = await pool.query(`
        SELECT gc.id, gc.gift_card_image, gc.store_id
        FROM gift_cards gc
        WHERE gc.status = 1
    `);

    if (rows.length === 0) return [];

    const cardsWithOffers = await Promise.all(
        rows.map(async (gc) => {
            const applicableOffer = await getApplicableOffer(gc.id);
            const valNum = applicableOffer ? parseFloat(applicableOffer.value) : 0;
            const offerTypeNum = applicableOffer ? Number(applicableOffer.offer_type) : 1;

            let display_text = '0%';
            if (applicableOffer) {
                display_text = offerTypeNum === OFFER_TYPE.INSTANT_DISCOUNT
                    ? `${valNum}% OFF`
                    : `${valNum}% Cashback`;
            }

            return {
                id: gc.id,
                gift_card_image: gc.gift_card_image || null,
                offer_type: offerTypeNum,
                discount_percentage: valNum,
                display_text
            };
        })
    );

    return cardsWithOffers
        .sort((a, b) => b.discount_percentage - a.discount_percentage || b.id - a.id)
        .slice(0, 6);
};

/**
 * Dashboard Service — runs all 3 sections concurrently via Promise.all
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
