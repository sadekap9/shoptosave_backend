import Joi from 'joi';
import { DISPUTE_STATUS } from '../config/constant/constant.js';

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
    status: Joi.number().integer().min(DISPUTE_STATUS.OPEN).max(DISPUTE_STATUS.CLOSED).required().messages({
        'any.required': 'status is required',
        'number.base': 'status must be a number',
        'number.min': `status must be at least ${DISPUTE_STATUS.OPEN} (Open)`,
        'number.max': `status must be at most ${DISPUTE_STATUS.CLOSED} (Closed)`
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
