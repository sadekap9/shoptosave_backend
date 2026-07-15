import Joi from 'joi';

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
    category_id: Joi.number().integer().positive().required().messages({
        'number.base': 'Category ID must be a number',
        'number.integer': 'Category ID must be an integer',
        'number.positive': 'Category ID must be positive',
        'any.required': 'Category ID is required'
    }),
    featured: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).default(0).optional().messages({
        'any.only': 'Featured must be 0, 1, true or false'
    }),
    status: Joi.alternatives().try(
        Joi.number().integer().valid(0, 1),
        Joi.boolean()
    ).default(1).optional().messages({
        'any.only': 'Status must be 0, 1, true or false'
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

