/**
 * Application Constants
 */

export const ORDER_STATUS = {
    PENDING: 0,
    PROCESSING: 1,
    COMPLETE: 2,
    CANCELLED: 3,
    FAILED: 4
};

export const TRANSACTION_TYPE = {
    DEBIT: 0,
    CREDIT: 1
};

export const TRANSACTION_STATUS = {
    PENDING: 0,
    SUCCESS: 1,
    FAILED: 2
};

export const TRANSACTION_SOURCE = {
    WOOHOO: 0,
    WALLET_LOAD: 1,
    P2P_SELL: 2,
    CASHBACK: 3
};

export const roleMap = [1, 2, 3]; // 1 = Admin, 2 = Sub Admin, 3 = User

export const ACCOUNT_STATUS = {
    ACTIVE: 1,
    INACTIVE: 0
};

export const DUMMY_USER = {
    PHONE: '+919999999999',
    OTP: '123456'
};

export const giftCardImageType = Object.freeze({
    MOBILE: 1,
    DESKTOP: 2
});

export const imageLimits = Object.freeze({
    MAX_COUNT: 20,
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5 MB
    ALLOWED_EXTENSIONS: /jpeg|jpg|png|webp/i,
    ALLOWED_MIME_TYPES: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
    ]
});

export const uploadFolders = Object.freeze({
    MOBILE: 'uploads/giftcards/mobile',
    DESKTOP: 'uploads/giftcards/desktop',
    MOBILE_URL_PREFIX: '/uploads/giftcards/mobile',
    DESKTOP_URL_PREFIX: '/uploads/giftcards/desktop'
});

export const USAGE_TYPE = Object.freeze({
    ONLINE: 1,
    OFFLINE: 2,
    BOTH: 3
});

export const UsageType = [1, 2, 3]; // 1 = online, 2 = offline, 3 = both

export const BANNER_TYPE = Object.freeze({
    HERO: 1,
    PROMOTIONAL: 2,
    CATEGORY: 3,
    OFFER: 4
});

export const BannerTypeValues = [1, 2, 3, 4]; // 1 = Hero, 2 = Promotional, 3 = Category, 4 = Offer

export const REDIRECT_TYPE = Object.freeze({
    URL: 1,
    PRODUCT: 2,
    CATEGORY: 3,
    STORE: 4
});

export const RedirectTypeValues = [1, 2, 3, 4]; // 1 = URL, 2 = Product, 3 = Category, 4 = Store

// Wallet Transaction Mapping Constants
export const WALLET_TXN_REFERENCE_TYPE = Object.freeze({
    ORDER: 1,
    TOPUP_REQUEST: 2,
    WITHDRAWAL: 3,
    P2P_SELL: 4,
    CASHBACK: 5,
    WALLET_LOAD: 6
});

export const WALLET_TXN_STATUS = Object.freeze({
    PENDING: 0,
    SUCCESS: 1,
    APPROVED: 2,
    FAILED: 3
});

// Database schema constants for user_wallet, payment_transactions, wallet_transactions, and gift_card_orders

export const WALLET_STATUS = Object.freeze({
    ACTIVE: 1,
    FROZEN: 2
});

export const PAYMENT_METHOD = Object.freeze({
    UPI: 1,
    CARD: 2,
    NETBANKING: 3
});

export const PAYMENT_TYPE = Object.freeze({
    WALLET_TOPUP: 1,
    ORDER_PAYMENT: 2
});

export const PAYMENT_TRANSACTION_STATUS = Object.freeze({
    PENDING: 1,
    SUCCESS: 2,
    FAILED: 3,
    REFUNDED: 4
});

export const WALLET_TRANSACTION_TYPE = Object.freeze({
    CREDIT: 1,
    DEBIT: 2
});

export const WALLET_TRANSACTION_SOURCE = Object.freeze({
    WALLET_TOPUP: 1,
    GIFT_CARD_PURCHASE: 2,
    REFUND: 3,
    CASHBACK: 4
});

export const WALLET_TRANSACTION_STATUS = Object.freeze({
    SUCCESS: 1,
    FAILED: 2
});

export const GIFT_CARD_ORDER_PAYMENT_TYPE = Object.freeze({
    WALLET_ONLY: 1,
    ONLINE_ONLY: 2,
    SPLIT_PAYMENT: 3
});


