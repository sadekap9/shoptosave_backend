import Joi from 'joi';

export const submitSellRequestSchema = Joi.object({
    gift_card_id: Joi.number().integer().positive().required().messages({
        'any.required': 'gift_card_id is required',
        'number.base': 'gift_card_id must be a number',
        'number.integer': 'gift_card_id must be an integer',
        'number.positive': 'gift_card_id must be a positive integer'
    }),
    card_number: Joi.string().trim().min(8).max(50).required().messages({
        'any.required': 'card_number is required',
        'string.empty': 'card_number cannot be empty',
        'string.min': 'card_number must be at least 8 characters long',
        'string.max': 'card_number cannot exceed 50 characters'
    }),
    card_pin: Joi.string().trim().min(3).max(20).required().messages({
        'any.required': 'card_pin is required',
        'string.empty': 'card_pin cannot be empty',
        'string.min': 'card_pin must be at least 3 characters long',
        'string.max': 'card_pin cannot exceed 20 characters'
    }),
    card_amount: Joi.number().positive().precision(2).required().messages({
        'any.required': 'card_amount is required',
        'number.base': 'card_amount must be a number',
        'number.positive': 'card_amount must be greater than zero'
    }),
    expiry_date: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().allow('', null).messages({
        'string.pattern.base': 'expiry_date must be in YYYY-MM-DD format'
    })
});

export const approveSellRequestSchema = Joi.object({
    offered_amount: Joi.number().positive().precision(2).required().messages({
        'any.required': 'offered_amount is required',
        'number.base': 'offered_amount must be a number',
        'number.positive': 'offered_amount must be greater than zero'
    })
});

export const rejectSellRequestSchema = Joi.object({
    rejection_reason: Joi.string().trim().max(255).required().messages({
        'any.required': 'rejection_reason is required',
        'string.empty': 'rejection_reason cannot be empty',
        'string.max': 'rejection_reason cannot exceed 255 characters'
    })
});

export const requestIdParamSchema = Joi.object({
    id: Joi.number().integer().positive().required().messages({
        'number.base': 'Request ID must be numeric',
        'number.integer': 'Request ID must be an integer',
        'number.positive': 'Request ID must be a positive number',
        'any.required': 'Request ID is required'
    })
});
