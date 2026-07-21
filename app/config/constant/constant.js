/**
 * Application Constants
 */

export const DUMMY_USER = {
    PHONE: '+919999999999',
    OTP: '123456'
};

export const roleMap = [1, 2, 3]; // 1 = Admin, 2 = Sub Admin, 3 = User

export const giftCardImageType = {
    MOBILE: 1,
    DESKTOP: 2
};

export const imageLimits = {
    MAX_COUNT: 20,
    MAX_FILE_SIZE: 20 * 1024 * 1024, // 20 MB
    ALLOWED_EXTENSIONS: /jpeg|jpg|png|webp/i,
    ALLOWED_MIME_TYPES: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
    ]
};

export const uploadFolders = {
    MOBILE: 'uploads/giftcards/mobile',
    DESKTOP: 'uploads/giftcards/desktop',
    MOBILE_URL_PREFIX: '/uploads/giftcards/mobile',
    DESKTOP_URL_PREFIX: '/uploads/giftcards/desktop'
};


export const BANNER_TYPE = {
    HERO: 1,
    PROMOTIONAL: 2,
    CATEGORY: 3,
    OFFER: 4
};

export const BannerTypeValues = [1, 2, 3, 4]; // 1 = Hero, 2 = Promotional, 3 = Category, 4 = Offer

export const RedirectTypeValues = [1, 2, 3, 4]; // 1 = URL, 2 = Product, 3 = Category, 4 = Store

// Database schema constants for user_wallet, payment_transactions, wallet_transactions, and gift_card_orders

export const WALLET_STATUS = {
    ACTIVE: 1,
    FROZEN: 2
};

export const PAYMENT_METHOD = {
    UPI: 1,
    CARD: 2,
    NETBANKING: 3
};

export const PAYMENT_TYPE = {
    WALLET_TOPUP: 1,
    ORDER_PAYMENT: 2
};

export const PAYMENT_TRANSACTION_STATUS = {
    PENDING: 1,
    SUCCESS: 2,
    FAILED: 3,
    REFUNDED: 4
};

export const WALLET_TRANSACTION_TYPE = {
    CREDIT: 1,
    DEBIT: 2
};

export const WALLET_TRANSACTION_SOURCE = {
    WALLET_TOPUP: 1,
    GIFT_CARD_PURCHASE: 2,
    REFUND: 3,
    CASHBACK: 4
};

export const TRANSACTION_TYPE = {
    CREDIT: 1,
    DEBIT: 2
};

export const TRANSACTION_SOURCE = {
    WALLET_TOPUP: 1,
    GIFT_CARD_PURCHASE: 2,
    REFUND: 3,
    CASHBACK: 4
};

export const WALLET_TRANSACTION_STATUS = {
    SUCCESS: 1,
    FAILED: 2
};

export const GIFT_CARD_ORDER_PAYMENT_TYPE = {
    WALLET_ONLY: 1,
    ONLINE_ONLY: 2,
    SPLIT_PAYMENT: 3
};

export const GIFT_CARD_ORDER_STATUS = {
    PENDING: 0,
    PROCESSING: 1,
    COMPLETE: 2,
    CANCELLED: 3,
    FAILED: 4,
    REFUNDED: 5
};

export const IS_SELF_PURCHASE = {
    YES: 1,
    NO: 0
};

export const OFFER_TYPE = {
    INSTANT_DISCOUNT: 1,
    CASHBACK: 2,
    PROMO_CODE: 3
};

export const VALUE_TYPE = {
    FLAT: 1,
    PERCENTAGE: 2
};

export const OFFER_STATUS = {
    ACTIVE: 1,
    INACTIVE: 0
};

export const OFFER_USAGE_STATUS = {
    SUCCESS: 1,
    FAILED: 2,
    REVERSED: 3
};

export const API_PROVIDER = {
    WOOHOO: 1,
    WOOHOO2: 2
};
