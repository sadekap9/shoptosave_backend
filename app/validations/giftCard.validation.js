import Joi from 'joi';
import { UsageType } from '../config/constant/constant.js';

export const createGiftCardSchema = Joi.object({
    store_id: Joi.number().integer().positive().required().messages({
        'number.base': 'Store ID must be a number',
        'number.integer': 'Store ID must be an integer',
        'number.positive': 'Store ID must be positive',
        'any.required': 'Store ID is required'
    }),
    gift_card_name: Joi.string().trim().required().max(255).messages({
        'string.empty': 'Gift card name is required',
        'any.required': 'Gift card name is required',
        'string.max': 'Gift card name cannot exceed 255 characters'
    }),
    sku: Joi.string().trim().max(100).allow('', null).optional().messages({
        'string.max': 'SKU cannot exceed 100 characters'
    }),
    min_denomination: Joi.number().precision(2).min(0).allow(null).optional().messages({
        'number.base': 'Min denomination must be a number',
        'number.min': 'Min denomination cannot be negative'
    }),
    max_denomination: Joi.number().precision(2).min(Joi.ref('min_denomination')).allow(null).optional().messages({
        'number.base': 'Max denomination must be a number',
        'number.min': 'Max denomination cannot be less than min denomination'
    }),
    things_to_note: Joi.string().allow('', null).optional(),
    redeem_steps: Joi.string().allow('', null).optional(),
    usage_type: Joi.alternatives().try(
        Joi.number().integer().valid(...UsageType),
        Joi.string().valid('ONLINE', 'OFFLINE')
    ).default(1).optional().messages({
        'any.only': 'Usage type must be 1 (ONLINE) or 0 (OFFLINE)'
    }),
    validity: Joi.string().trim().max(100).allow('', null).optional().messages({
        'string.max': 'Validity text cannot exceed 100 characters'
    }),
    partial_redemption: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).default(0).optional().messages({
        'any.only': 'Partial redemption must be 0, 1, true or false'
    }),
    multiple_gift_cards_allowed: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).default(0).optional().messages({
        'any.only': 'Multiple gift cards allowed must be 0, 1, true or false'
    }),
    monthly_purchase_limit: Joi.number().integer().min(0).allow(null).optional().messages({
        'number.base': 'Monthly purchase limit must be an integer',
        'number.min': 'Monthly purchase limit cannot be negative'
    }),
    discount_percentage: Joi.number().precision(2).min(0).max(100).allow(null).optional().messages({
        'number.base': 'Discount percentage must be a number',
        'number.min': 'Discount percentage cannot be negative',
        'number.max': 'Discount percentage cannot exceed 100'
    }),
    cashback_percentage: Joi.number().precision(2).min(0).max(100).allow(null).optional().messages({
        'number.base': 'Cashback percentage must be a number',
        'number.min': 'Cashback percentage cannot be negative',
        'number.max': 'Cashback percentage cannot exceed 100'
    }),
    resell_allowed: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).default(0).optional().messages({
        'any.only': 'Resell allowed must be 0, 1, true or false'
    }),
    resell_margin: Joi.number().precision(2).min(0).max(100).default(0.00).optional().messages({
        'number.base': 'Resell margin must be a number',
        'number.min': 'Resell margin cannot be negative',
        'number.max': 'Resell margin cannot exceed 100'
    }),
    status: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).default(1).optional().messages({
        'any.only': 'Status must be 0, 1, true or false'
    }),
    mobile_images: Joi.any().optional(),
    desktop_images: Joi.any().optional()
});

export const updateGiftCardSchema = Joi.object({
    store_id: Joi.number().integer().positive().optional().messages({
        'number.base': 'Store ID must be a number',
        'number.integer': 'Store ID must be an integer',
        'number.positive': 'Store ID must be positive'
    }),
    gift_card_name: Joi.string().trim().max(255).optional().messages({
        'string.empty': 'Gift card name cannot be empty',
        'string.max': 'Gift card name cannot exceed 255 characters'
    }),
    sku: Joi.string().trim().max(100).allow('', null).optional().messages({
        'string.max': 'SKU cannot exceed 100 characters'
    }),
    min_denomination: Joi.number().precision(2).min(0).allow(null).optional().messages({
        'number.base': 'Min denomination must be a number',
        'number.min': 'Min denomination cannot be negative'
    }),
    max_denomination: Joi.number().precision(2).min(Joi.ref('min_denomination')).allow(null).optional().messages({
        'number.base': 'Max denomination must be a number',
        'number.min': 'Max denomination cannot be less than min denomination'
    }),
    things_to_note: Joi.string().allow('', null).optional(),
    redeem_steps: Joi.string().allow('', null).optional(),
    usage_type: Joi.alternatives().try(
        Joi.number().integer().valid(...UsageType),
        Joi.string().valid('ONLINE', 'OFFLINE')
    ).optional().messages({
        'any.only': 'Usage type must be 1 (ONLINE) or 0 (OFFLINE)'
    }),
    validity: Joi.string().trim().max(100).allow('', null).optional().messages({
        'string.max': 'Validity text cannot exceed 100 characters'
    }),
    partial_redemption: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).optional().messages({
        'any.only': 'Partial redemption must be 0, 1, true or false'
    }),
    multiple_gift_cards_allowed: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).optional().messages({
        'any.only': 'Multiple gift cards allowed must be 0, 1, true or false'
    }),
    monthly_purchase_limit: Joi.number().integer().min(0).allow(null).optional().messages({
        'number.base': 'Monthly purchase limit must be an integer',
        'number.min': 'Monthly purchase limit cannot be negative'
    }),
    discount_percentage: Joi.number().precision(2).min(0).max(100).allow(null).optional().messages({
        'number.base': 'Discount percentage must be a number',
        'number.min': 'Discount percentage cannot be negative',
        'number.max': 'Discount percentage cannot exceed 100'
    }),
    cashback_percentage: Joi.number().precision(2).min(0).max(100).allow(null).optional().messages({
        'number.base': 'Cashback percentage must be a number',
        'number.min': 'Cashback percentage cannot be negative',
        'number.max': 'Cashback percentage cannot exceed 100'
    }),
    resell_allowed: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).optional().messages({
        'any.only': 'Resell allowed must be 0, 1, true or false'
    }),
    resell_margin: Joi.number().precision(2).min(0).max(100).optional().messages({
        'number.base': 'Resell margin must be a number',
        'number.min': 'Resell margin cannot be negative',
        'number.max': 'Resell margin cannot exceed 100'
    }),
    status: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).optional().messages({
        'any.only': 'Status must be 0, 1, true or false'
    }),
    mobile_images: Joi.any().optional(),
    desktop_images: Joi.any().optional(),
    deleted_image_ids: Joi.any().optional()
});
