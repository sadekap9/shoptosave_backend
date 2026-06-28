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
