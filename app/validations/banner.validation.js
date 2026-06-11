import Joi from 'joi';
import { BannerTypeValues, RedirectTypeValues } from '../config/constant/constant.js';

export const createBannerSchema = Joi.object({
    banner_name: Joi.string()
        .trim()
        .required()
        .max(255)
        .messages({
            'string.empty': 'Banner name is required',
            'any.required': 'Banner name is required',
            'string.max': 'Banner name cannot exceed 255 characters'
        }),
    title: Joi.string()
        .trim()
        .required()
        .max(255)
        .messages({
            'string.empty': 'Title is required',
            'any.required': 'Title is required',
            'string.max': 'Title cannot exceed 255 characters'
        }),
    highlighted_text: Joi.string().trim().max(255).allow('', null).optional(),
    subtitle: Joi.string().trim().allow('', null).optional(),
    offer_text: Joi.string().trim().max(100).allow('', null).optional(),
    banner_image: Joi.string().trim().allow('', null).optional(),
    background_color: Joi.string().trim().max(20).default('#F5F3FF').optional(),
    primary_button_text: Joi.string().trim().max(100).allow('', null).optional(),
    primary_button_link: Joi.string().trim().max(500).allow('', null).optional(),
    secondary_button_text: Joi.string().trim().max(100).allow('', null).optional(),
    secondary_button_link: Joi.string().trim().max(500).allow('', null).optional(),
    banner_type: Joi.number().integer().valid(...BannerTypeValues).required().messages({
        'any.required': 'Banner type is required',
        'any.only': `Banner type must be one of ${BannerTypeValues.join(', ')}`
    }),
    redirect_type: Joi.number().integer().valid(...RedirectTypeValues).required().messages({
        'any.required': 'Redirect type is required',
        'any.only': `Redirect type must be one of ${RedirectTypeValues.join(', ')}`
    }),
    redirect_value: Joi.string().trim().max(255).allow('', null).optional(),
    display_order: Joi.number().integer().min(0).default(0).optional(),
    start_date: Joi.date().iso().allow(null).optional(),
    end_date: Joi.date().iso().allow(null).optional(),
    status: Joi.number().integer().valid(0, 1).default(1).optional().messages({
        'any.only': 'Status must be 0 or 1'
    })
});

export const updateBannerSchema = Joi.object({
    banner_name: Joi.string()
        .trim()
        .max(255)
        .messages({
            'string.empty': 'Banner name cannot be empty',
            'string.max': 'Banner name cannot exceed 255 characters'
        }).optional(),
    title: Joi.string()
        .trim()
        .max(255)
        .messages({
            'string.empty': 'Title cannot be empty',
            'string.max': 'Title cannot exceed 255 characters'
        }).optional(),
    highlighted_text: Joi.string().trim().max(255).allow('', null).optional(),
    subtitle: Joi.string().trim().allow('', null).optional(),
    offer_text: Joi.string().trim().max(100).allow('', null).optional(),
    banner_image: Joi.string().trim().allow('', null).optional(),
    background_color: Joi.string().trim().max(20).optional(),
    primary_button_text: Joi.string().trim().max(100).allow('', null).optional(),
    primary_button_link: Joi.string().trim().max(500).allow('', null).optional(),
    secondary_button_text: Joi.string().trim().max(100).allow('', null).optional(),
    secondary_button_link: Joi.string().trim().max(500).allow('', null).optional(),
    banner_type: Joi.number().integer().valid(...BannerTypeValues).optional().messages({
        'any.only': `Banner type must be one of ${BannerTypeValues.join(', ')}`
    }),
    redirect_type: Joi.number().integer().valid(...RedirectTypeValues).optional().messages({
        'any.only': `Redirect type must be one of ${RedirectTypeValues.join(', ')}`
    }),
    redirect_value: Joi.string().trim().max(255).allow('', null).optional(),
    display_order: Joi.number().integer().min(0).optional(),
    start_date: Joi.date().iso().allow(null).optional(),
    end_date: Joi.date().iso().allow(null).optional(),
    status: Joi.number().integer().valid(0, 1).optional().messages({
        'any.only': 'Status must be 0 or 1'
    })
});
