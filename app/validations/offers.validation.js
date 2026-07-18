import Joi from 'joi';
import { OFFER_TYPE, VALUE_TYPE, OFFER_STATUS } from '../config/constant/constant.js';

export const createOfferSchema = Joi.object({
    offer_name: Joi.string().max(150).required().messages({
        'any.required': 'Offer name (offer_name) is required',
        'string.empty': 'Offer name cannot be empty',
        'string.max': 'Offer name cannot exceed 150 characters'
    }),
    offer_type: Joi.number().valid(OFFER_TYPE.INSTANT_DISCOUNT, OFFER_TYPE.CASHBACK).required().messages({
        'any.required': 'Offer type is required',
        'any.only': `Offer type must be ${OFFER_TYPE.INSTANT_DISCOUNT} (Instant Discount) or ${OFFER_TYPE.CASHBACK} (Cashback)`
    }),
    store_id: Joi.number().integer().positive().allow(null).optional(),
    gift_card_id: Joi.number().integer().positive().allow(null).optional(),
    value_type: Joi.number().valid(VALUE_TYPE.FLAT, VALUE_TYPE.PERCENTAGE).optional().default(VALUE_TYPE.PERCENTAGE).messages({
        'any.only': `Value type must be ${VALUE_TYPE.FLAT} (Flat) or ${VALUE_TYPE.PERCENTAGE} (Percentage)`
    }),
    value: Joi.number().positive().required().messages({
        'any.required': 'Value is required',
        'number.positive': 'Value must be a positive number'
    }),
    min_order_amount: Joi.number().min(0).default(0).optional(),
    max_discount: Joi.number().positive().allow(null).optional(),
    total_usage_limit: Joi.number().integer().positive().allow(null).optional(),
    per_user_limit: Joi.number().integer().positive().allow(null).optional(),
    unique_users_only: Joi.number().valid(1, 0).default(0).optional(),
    start_date: Joi.date().iso().required().messages({
        'any.required': 'Start date is required',
        'date.format': 'Start date must be a valid ISO date'
    }),
    end_date: Joi.date().iso().greater(Joi.ref('start_date')).required().messages({
        'any.required': 'End date is required',
        'date.greater': 'start_date must be strictly before end_date',
        'date.format': 'End date must be a valid ISO date'
    }),
    status: Joi.number().valid(OFFER_STATUS.ACTIVE, OFFER_STATUS.INACTIVE).default(OFFER_STATUS.ACTIVE).optional()
})
.xor('store_id', 'gift_card_id')
.messages({
    'object.xor': 'Exactly one of store_id or gift_card_id must be provided'
})
.custom((obj, helpers) => {
    const vt = obj.value_type !== undefined ? obj.value_type : VALUE_TYPE.PERCENTAGE;
    if (vt === VALUE_TYPE.PERCENTAGE && obj.value > 100) {
        return helpers.message('Percentage value must be less than or equal to 100');
    }
    return obj;
})
.unknown(true);

export const updateOfferSchema = Joi.object({
    offer_name: Joi.string().max(150).optional(),
    offer_type: Joi.number().valid(OFFER_TYPE.INSTANT_DISCOUNT, OFFER_TYPE.CASHBACK).optional().messages({
        'any.only': `Offer type must be ${OFFER_TYPE.INSTANT_DISCOUNT} (Instant Discount) or ${OFFER_TYPE.CASHBACK} (Cashback)`
    }),
    store_id: Joi.number().integer().positive().allow(null).optional(),
    gift_card_id: Joi.number().integer().positive().allow(null).optional(),
    value_type: Joi.number().valid(VALUE_TYPE.FLAT, VALUE_TYPE.PERCENTAGE).optional(),
    value: Joi.number().positive().optional(),
    min_order_amount: Joi.number().min(0).optional(),
    max_discount: Joi.number().positive().allow(null).optional(),
    total_usage_limit: Joi.number().integer().positive().allow(null).optional(),
    per_user_limit: Joi.number().integer().positive().allow(null).optional(),
    unique_users_only: Joi.number().valid(1, 0).optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().greater(Joi.ref('start_date')).optional().messages({
        'date.greater': 'start_date must be strictly before end_date'
    }),
    status: Joi.number().valid(OFFER_STATUS.ACTIVE, OFFER_STATUS.INACTIVE).optional()
})
.custom((obj, helpers) => {
    if (obj.store_id !== undefined && obj.gift_card_id !== undefined) {
        if ((obj.store_id && obj.gift_card_id) || (!obj.store_id && !obj.gift_card_id)) {
            return helpers.message('Exactly one of store_id or gift_card_id must be provided');
        }
    }
    if (obj.value !== undefined && (obj.value_type === VALUE_TYPE.PERCENTAGE || obj.value_type === undefined)) {
        if (obj.value > 100) {
            return helpers.message('Percentage value must be less than or equal to 100');
        }
    }
    return obj;
})
.unknown(true);

export const changeStatusSchema = Joi.object({
    status: Joi.number().valid(OFFER_STATUS.ACTIVE, OFFER_STATUS.INACTIVE).required().messages({
        'any.required': 'Status is required',
        'any.only': `Status must be ${OFFER_STATUS.ACTIVE} (Active) or ${OFFER_STATUS.INACTIVE} (Inactive)`
    })
});
