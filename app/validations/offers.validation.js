import Joi from 'joi';

export const createOfferSchema = Joi.object({
    offer_name: Joi.string().trim().max(150).required().messages({
        'any.required': 'Offer name is required',
        'string.empty': 'Offer name cannot be empty',
        'string.max': 'Offer name cannot exceed 150 characters'
    }),
    offer_type: Joi.number().valid(1, 2).required().messages({
        'any.required': 'Offer type is required',
        'any.only': 'Offer type must be 1 (Instant Discount) or 2 (Cashback)'
    }),
    promo_code: Joi.string().trim().max(50).optional().allow('', null),
    store_id: Joi.number().integer().positive().allow(null).optional(),
    gift_card_id: Joi.number().integer().positive().allow(null).optional(),
    value_type: Joi.number().valid(1, 2).optional().default(2).messages({
        'any.only': 'Value type must be 1 (Flat) or 2 (Percentage)'
    }),
    value: Joi.number().positive().optional(),
    percentage: Joi.number().greater(0).max(100).optional().messages({
        'number.greater': 'Percentage must be greater than 0',
        'number.max': 'Percentage must be less than or equal to 100'
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
    end_date: Joi.date().iso().greater(Joi.ref('start_date')).required().messages({
        'any.required': 'End date is required',
        'date.greater': 'start_date must be strictly before end_date',
        'date.format': 'End date must be a valid ISO date'
    }),
    status: Joi.number().valid(1, 0).default(1).optional()
})
.xor('store_id', 'gift_card_id')
.messages({
    'object.xor': 'Exactly one of store_id or gift_card_id must be provided'
})
.custom((value, helpers) => {
    const val = value.value !== undefined ? value.value : value.percentage;
    if (val === undefined || val === null) {
        return helpers.message('Value or percentage is required');
    }
    if (value.value_type === 2 || value.percentage !== undefined) {
        if (val <= 0 || val > 100) {
            return helpers.message('Percentage must be greater than 0 and less than or equal to 100');
        }
    }
    return value;
})
.unknown(true);

export const updateOfferSchema = Joi.object({
    offer_name: Joi.string().trim().max(150).optional(),
    offer_type: Joi.number().valid(1, 2).optional().messages({
        'any.only': 'Offer type must be 1 (Instant Discount) or 2 (Cashback)'
    }),
    promo_code: Joi.string().trim().max(50).optional().allow('', null),
    store_id: Joi.number().integer().positive().allow(null).optional(),
    gift_card_id: Joi.number().integer().positive().allow(null).optional(),
    value_type: Joi.number().valid(1, 2).optional(),
    value: Joi.number().positive().optional(),
    percentage: Joi.number().greater(0).max(100).optional(),
    min_order_amount: Joi.number().min(0).optional(),
    max_discount: Joi.number().positive().allow(null).optional(),
    total_usage_limit: Joi.number().integer().positive().allow(null).optional(),
    per_user_limit: Joi.number().integer().positive().allow(null).optional(),
    unique_users_only: Joi.number().valid(0, 1).optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().greater(Joi.ref('start_date')).optional().messages({
        'date.greater': 'start_date must be strictly before end_date'
    }),
    status: Joi.number().valid(1, 0).optional()
})
.custom((value, helpers) => {
    if (value.store_id !== undefined && value.gift_card_id !== undefined) {
        if ((value.store_id && value.gift_card_id) || (!value.store_id && !value.gift_card_id)) {
            return helpers.message('Exactly one of store_id or gift_card_id must be provided');
        }
    }
    const val = value.value !== undefined ? value.value : value.percentage;
    if (val !== undefined && val !== null && (value.value_type === 2 || value.percentage !== undefined)) {
        if (val <= 0 || val > 100) {
            return helpers.message('Percentage must be greater than 0 and less than or equal to 100');
        }
    }
    return value;
})
.unknown(true);

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
