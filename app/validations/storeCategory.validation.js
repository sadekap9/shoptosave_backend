import Joi from 'joi';

export const createStoreCategorySchema = Joi.object({
    category_name: Joi.string()
        .trim()
        .required()
        .pattern(/^[^\d]*$/)
        .messages({
            'string.empty': 'Category name is required',
            'any.required': 'Category name is required',
            'string.pattern.base': 'Category name cannot contain numbers'
        }),
    logo: Joi.string().trim().allow('', null).optional(),
    status: Joi.number().integer().valid(0, 1).optional().messages({
        'number.base': 'Status must be a number',
        'any.only': 'Status must be 0 or 1'
    })
});

export const updateStoreCategorySchema = Joi.object({
    category_name: Joi.string()
        .trim()
        .pattern(/^[^\d]*$/)
        .messages({
            'string.empty': 'Category name cannot be empty',
            'string.pattern.base': 'Category name cannot contain numbers'
        }).optional(),
    logo: Joi.string().trim().allow('', null).optional(),
    status: Joi.number().integer().valid(0, 1).optional().messages({
        'number.base': 'Status must be a number',
        'any.only': 'Status must be 0 or 1'
    })
});

export const storeCategoryIdParamSchema = Joi.object({
    id: Joi.number().integer().positive().required().messages({
        'number.base': 'Category ID must be numeric',
        'number.integer': 'Category ID must be an integer',
        'number.positive': 'Category ID must be a positive number',
        'any.required': 'Category ID is required'
    })
});

