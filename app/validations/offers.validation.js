import Joi from 'joi';

export const createOfferSchema = Joi.object({
    offer_name: Joi.string().trim().max(150).required().messages({
        'any.required': 'Offer name is required',
        'string.empty': 'Offer name cannot be empty',
        'string.max': 'Offer name cannot exceed 150 characters'
    }),
    offer_type: Joi.number().valid(1, 2, 3).required().messages({
        'any.required': 'Offer type is required',
        'any.only': 'Offer type must be 1 (Instant Discount), 2 (Cashback), or 3 (Promo Code)'
    }),
    promo_code: Joi.string().trim().max(50).when('offer_type', {
        is: 3,
        then: Joi.required(),
        otherwise: Joi.optional().allow('', null)
    }).messages({
        'any.required': 'Promo code is required when offer type is Promo Code'
    }),
    store_id: Joi.number().integer().positive().allow(null).optional(),
    gift_card_id: Joi.number().integer().positive().allow(null).optional(),
    value_type: Joi.number().valid(1, 2).required().messages({
        'any.required': 'Value type is required',
        'any.only': 'Value type must be 1 (Flat) or 2 (Percentage)'
    }),
    value: Joi.number().positive().required().messages({
        'any.required': 'Value is required',
        'number.positive': 'Value must be a positive number'
    }),
    min_order_amount: Joi.number().min(0).default(0).optional(),
    max_discount: Joi.number().positive().allow(null).optional(),
    total_usage_limit: Joi.number().integer().positive().allow(null).optional(),
    per_user_limit: Joi.number().integer().positive().allow(null).optional(),
    unique_users_only: Joi.number().valid(0, 1).default(0).optional(),
    start_date: Joi.date().iso().required().messages({
        'any.required': 'Start date is required',
        'date.format': 'Start date must be a valid ISO date'
    }),
    end_date: Joi.date().iso().min(Joi.ref('start_date')).required().messages({
        'any.required': 'End date is required',
        'date.min': 'End date must be after or equal to start date',
        'date.format': 'End date must be a valid ISO date'
    }),
    status: Joi.number().valid(1, 0).default(1).optional()
});

export const updateOfferSchema = Joi.object({
    offer_name: Joi.string().trim().max(150).optional(),
    offer_type: Joi.number().valid(1, 2, 3).optional(),
    promo_code: Joi.string().trim().max(50).optional().allow('', null),
    store_id: Joi.number().integer().positive().allow(null).optional(),
    gift_card_id: Joi.number().integer().positive().allow(null).optional(),
    value_type: Joi.number().valid(1, 2).optional(),
    value: Joi.number().positive().optional(),
    min_order_amount: Joi.number().min(0).optional(),
    max_discount: Joi.number().positive().allow(null).optional(),
    total_usage_limit: Joi.number().integer().positive().allow(null).optional(),
    per_user_limit: Joi.number().integer().positive().allow(null).optional(),
    unique_users_only: Joi.number().valid(0, 1).optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().min(Joi.ref('start_date')).optional(),
    status: Joi.number().valid(1, 0).optional()
});

export const changeStatusSchema = Joi.object({
    status: Joi.number().valid(1, 0).required().messages({
        'any.required': 'Status is required',
        'any.only': 'Status must be 1 (Active) or 0 (Inactive)'
    })
});

export const applyPromoSchema = Joi.object({
    promo_code: Joi.string().trim().uppercase().max(50).required().messages({
        'any.required': 'Promo code is required',
        'string.empty': 'Promo code cannot be empty'
    }),
    gift_card_id: Joi.number().integer().positive().required().messages({
        'any.required': 'gift_card_id is required',
        'number.base': 'gift_card_id must be a number'
    }),
    amount: Joi.number().positive().required().messages({
        'any.required': 'amount is required',
        'number.positive': 'amount must be positive'
    }),
    user_id: Joi.number().integer().positive().optional().allow(null)
});
