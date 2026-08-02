import Joi from 'joi';

export const createDisputeSchema = Joi.object({
    subject: Joi.string().max(150).trim().required().messages({
        'any.required': 'subject is required',
        'string.empty': 'subject cannot be empty',
        'string.max': 'subject cannot exceed 150 characters'
    }),
    message: Joi.string().trim().required().messages({
        'any.required': 'message is required',
        'string.empty': 'message cannot be empty'
    })
});

export const updateDisputeStatusSchema = Joi.object({
    status: Joi.number().integer().min(1).max(4).required().messages({
        'any.required': 'status is required',
        'number.base': 'status must be a number',
        'number.min': 'status must be at least 1 (Open)',
        'number.max': 'status must be at most 4 (Closed)'
    })
});

export const disputeIdParamSchema = Joi.object({
    disputeId: Joi.number().integer().positive().required().messages({
        'number.base': 'Dispute ID must be numeric',
        'number.integer': 'Dispute ID must be an integer',
        'number.positive': 'Dispute ID must be a positive number',
        'any.required': 'Dispute ID is required'
    })
});
