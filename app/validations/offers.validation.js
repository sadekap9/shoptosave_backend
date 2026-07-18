import Joi from 'joi';
import { OFFER_TYPE, OFFER_STATUS } from '../config/constant/constant.js';

export const createOfferSchema = Joi.object({
    offer_name: Joi.string().max(255).required().messages({
        'any.required': 'Offer name is required'
    }),

    description: Joi.string().allow('', null).optional(),

    offer_type: Joi.number()
        .valid(OFFER_TYPE.INSTANT_DISCOUNT, OFFER_TYPE.CASHBACK)
        .required()
        .messages({
            'any.required': 'Offer type is required',
            'any.only': 'Invalid offer type'
        }),

    value: Joi.number()
        .positive()
        .max(100)
        .required()
        .messages({
            'any.required': 'Value is required',
            'number.positive': 'Value must be greater than 0',
            'number.max': 'Value cannot exceed 100'
        }),

    store_id: Joi.number().integer().positive().allow(null, '').optional(),

    gift_card_id: Joi.number().integer().positive().allow(null, '').optional(),

    start_date: Joi.date()
        .iso()
        .required()
        .messages({
            'any.required': 'Start date is required'
        }),

    end_date: Joi.date()
        .iso()
        .greater(Joi.ref('start_date'))
        .required()
        .messages({
            'any.required': 'End date is required',
            'date.greater': 'End date must be greater than start date'
        }),

    status: Joi.number()
        .valid(OFFER_STATUS.ACTIVE, OFFER_STATUS.INACTIVE)
        .default(OFFER_STATUS.ACTIVE)
})
.xor('store_id', 'gift_card_id')
.messages({
    'object.xor': 'Either store_id or gift_card_id is required, but not both.'
})
.unknown(true);

export const updateOfferSchema = Joi.object({
    offer_name: Joi.string().max(255),

    description: Joi.string().allow('', null),

    offer_type: Joi.number()
        .valid(OFFER_TYPE.INSTANT_DISCOUNT, OFFER_TYPE.CASHBACK)
        .messages({
            'any.only': 'Invalid offer type'
        }),

    value: Joi.number()
        .positive()
        .max(100)
        .messages({
            'number.positive': 'Value must be greater than 0',
            'number.max': 'Value cannot exceed 100'
        }),

    store_id: Joi.number().integer().positive().allow(null, '').optional(),

    gift_card_id: Joi.number().integer().positive().allow(null, '').optional(),

    start_date: Joi.date().iso(),

    end_date: Joi.date()
        .iso()
        .greater(Joi.ref('start_date'))
        .messages({
            'date.greater': 'End date must be greater than start date'
        }),

    status: Joi.number()
        .valid(OFFER_STATUS.ACTIVE, OFFER_STATUS.INACTIVE)
})
.oxor('store_id', 'gift_card_id')
.messages({
    'object.oxor': 'Only one of store_id or gift_card_id can be provided.'
})
.unknown(true);

export const changeStatusSchema = Joi.object({
    status: Joi.number()
        .valid(OFFER_STATUS.ACTIVE, OFFER_STATUS.INACTIVE)
        .required()
        .messages({
            'any.required': 'Status is required',
            'any.only': 'Invalid status'
        })
});