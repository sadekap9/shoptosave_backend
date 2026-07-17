import Joi from 'joi';

export const placeOrderSchema = Joi.object({
    gift_card_id: Joi.number().integer().required().messages({
        'any.required': 'gift_card_id is required',
        'number.base': 'gift_card_id must be a number'
    }),
    amount: Joi.number().precision(2).positive().required().messages({
        'any.required': 'amount is required',
        'number.positive': 'amount must be a positive number'
    }),
    recipient_name: Joi.string().max(100).required().messages({
        'any.required': 'recipient_name is required',
        'string.empty': 'recipient_name cannot be empty'
    }),
    recipient_email: Joi.string().email().max(100).required().messages({
        'any.required': 'recipient_email is required',
        'string.email': 'Please provide a valid recipient_email'
    }),
    recipient_mobile: Joi.string().max(20).required().messages({
        'any.required': 'recipient_mobile is required',
        'string.empty': 'recipient_mobile cannot be empty'
    }),
    gift_message: Joi.string().max(255).optional().allow('', null)
});

export const giftCardOrderSchema = Joi.object({
    giftcard_id: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
        'any.required': 'giftcard_id is required'
    }),
    sku: Joi.string().required().messages({
        'any.required': 'sku is required'
    }),
    price: Joi.number().positive().required().messages({
        'any.required': 'price is required',
        'number.positive': 'price must be positive'
    }),
    qty: Joi.number().integer().min(1).required().messages({
        'any.required': 'qty is required',
        'number.min': 'qty must be at least 1'
    }),
    payment_type: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required().messages({
        'any.required': 'payment_type is required'
    }),
    payment_method: Joi.alternatives().try(Joi.number().integer(), Joi.string()).optional(),
    is_self_purchase: Joi.alternatives().try(Joi.number().integer(), Joi.string()).optional(),
    recipient_name: Joi.string().max(100).optional().allow('', null),
    recipient_email: Joi.string().email().max(100).optional().allow('', null),
    recipient_mobile: Joi.string().max(20).optional().allow('', null),
    gift_message: Joi.string().max(255).optional().allow('', null),
    promo_code: Joi.string().trim().uppercase().max(50).optional().allow('', null),
    offer_id: Joi.number().integer().positive().optional().allow(null)
});

export const orderIdParamSchema = Joi.object({
    orderId: Joi.number().integer().positive().required().messages({
        'number.base': 'Order ID must be numeric',
        'number.integer': 'Order ID must be an integer',
        'number.positive': 'Order ID must be a positive number',
        'any.required': 'Order ID is required'
    })
});


