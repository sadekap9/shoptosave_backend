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

export const UsageType = [1, 0]; // 1 = online, 0 = offline
