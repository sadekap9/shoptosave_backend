import Joi from 'joi';
import { OFFER_TYPE, OFFER_STATUS } from '../config/constant/constant.js';

export const createOfferSchema = Joi.object({
    offer_name: Joi.string().max(255).optional(),
    title: Joi.string().max(255).optional(),
    description: Joi.string().allow('', null).optional(),
    offer_type: Joi.number().valid(OFFER_TYPE.INSTANT_DISCOUNT, OFFER_TYPE.CASHBACK).required().messages({
        'any.required': 'Offer type is required',
        'any.only': `Offer type must be ${OFFER_TYPE.INSTANT_DISCOUNT} (Instant Discount) or ${OFFER_TYPE.CASHBACK} (Cashback)`
    }),
    value: Joi.number().positive().max(100).required().messages({
        'any.required': 'Value is required',
        'number.positive': 'Value must be a positive percentage number',
        'number.max': 'Value percentage must be less than or equal to 100'
    }),
    store_id: Joi.number().integer().positive().allow(null).optional(),
    gift_card_id: Joi.number().integer().positive().allow(null).optional(),
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
    if (!obj.offer_name && !obj.title) {
        return helpers.message('Offer name (offer_name) is required');
    }
    return obj;
})
.unknown(true);

export const updateOfferSchema = Joi.object({
    offer_name: Joi.string().max(255).optional(),
    title: Joi.string().max(255).optional(),
    description: Joi.string().allow('', null).optional(),
    offer_type: Joi.number().valid(OFFER_TYPE.INSTANT_DISCOUNT, OFFER_TYPE.CASHBACK).optional().messages({
        'any.only': `Offer type must be ${OFFER_TYPE.INSTANT_DISCOUNT} (Instant Discount) or ${OFFER_TYPE.CASHBACK} (Cashback)`
    }),
    value: Joi.number().positive().max(100).optional().messages({
        'number.positive': 'Value must be a positive percentage number',
        'number.max': 'Value percentage must be less than or equal to 100'
    }),
    store_id: Joi.number().integer().positive().allow(null).optional(),
    gift_card_id: Joi.number().integer().positive().allow(null).optional(),
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
    return obj;
})
.unknown(true);

export const changeStatusSchema = Joi.object({
    status: Joi.number().valid(OFFER_STATUS.ACTIVE, OFFER_STATUS.INACTIVE).required().messages({
        'any.required': 'Status is required',
        'any.only': `Status must be ${OFFER_STATUS.ACTIVE} (Active) or ${OFFER_STATUS.INACTIVE} (Inactive)`
    })
});
