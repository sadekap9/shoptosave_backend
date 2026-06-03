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

export const USER_ROLE = {
    ADMIN: 1,
    USER: 2
};

export const ACCOUNT_STATUS = {
    ACTIVE: 1,
    INACTIVE: 0
};

export const DUMMY_USER = {
    PHONE: '+919999999999',
    OTP: '123456'
};
