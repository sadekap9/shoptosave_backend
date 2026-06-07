import Joi from 'joi';
import { UsageType } from '../config/constant/constant.js';

export const createGiftCardSchema = Joi.object({
    store_id: Joi.number().integer().positive().required().messages({
        'number.base': 'Store ID must be a number',
        'number.integer': 'Store ID must be an integer',
        'number.positive': 'Store ID must be positive',
        'any.required': 'Store ID is required'
    }),
    sku: Joi.string().trim().max(100).required().messages({
        'string.empty': 'SKU is required',
        'any.required': 'SKU is required',
        'string.max': 'SKU cannot exceed 100 characters'
    }),
    status: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).default(1).optional().messages({
        'any.only': 'Status must be 0, 1, true or false'
    }),
    featured: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).default(0).optional().messages({
        'any.only': 'Featured must be 0, 1, true or false'
    }),
    sort_order: Joi.number().integer().default(0).optional().messages({
        'number.base': 'Sort order must be an integer'
    }),
    home_page_visibility: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).default(1).optional().messages({
        'any.only': 'Home page visibility must be 0, 1, true or false'
    }),
    commission_percentage: Joi.number().precision(2).min(0).max(100).default(0.00).optional().messages({
        'number.base': 'Commission percentage must be a number'
    }),
    resell_margin: Joi.number().precision(2).min(0).max(100).default(0.00).optional().messages({
        'number.base': 'Resell margin must be a number'
    }),
    platform_discount: Joi.number().precision(2).min(0).max(100).default(0.00).optional().messages({
        'number.base': 'Platform discount must be a number'
    }),
    cashback_percentage: Joi.number().precision(2).min(0).max(100).default(0.00).optional().messages({
        'number.base': 'Cashback percentage must be a number'
    })
});

export const updateGiftCardSchema = Joi.object({
    status: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).required().messages({
        'any.only': 'Status must be 0, 1, true or false',
        'any.required': 'Status is required'
    })
});

