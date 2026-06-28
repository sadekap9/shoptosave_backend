import Joi from 'joi';

export const requestTopupSchema = Joi.object({
    amount: Joi.number().precision(2).positive().required().messages({
        'any.required': 'Amount is required',
        'number.positive': 'Amount must be positive'
    }),
    payment_mode: Joi.number().integer().required().messages({
        'any.required': 'Payment mode is required'
    }),
    payment_reference: Joi.string().max(255).required().messages({
        'any.required': 'Payment reference is required'
    })
});

export const approveTopupSchema = Joi.object({
    status: Joi.number().valid(2, 3).required().messages({
        'any.required': 'Approval status is required',
        'any.only': 'Status must be either 2 (Approved) or 3 (Rejected)'
    }),
    remarks: Joi.string().max(255).optional().allow('', null)
});
