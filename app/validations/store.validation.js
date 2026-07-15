import Joi from 'joi';

export const createStoreSchema = Joi.object({
    store_name: Joi.string()
        .trim()
        .required()
        .max(100)
        .messages({
            'string.empty': 'Store name is required',
            'any.required': 'Store name is required',
            'string.max': 'Store name cannot exceed 100 characters'
        }),
    logo: Joi.string().trim().allow('', null).optional(),
    status: Joi.number().integer().valid(0, 1).optional().messages({
        'number.base': 'Status must be a number',
        'any.only': 'Status must be 0 or 1'
    })
});

export const updateStoreSchema = Joi.object({
    store_name: Joi.string()
        .trim()
        .max(100)
        .messages({
            'string.empty': 'Store name cannot be empty',
            'string.max': 'Store name cannot exceed 100 characters'
        }).optional(),
    logo: Joi.string().trim().allow('', null).optional(),
    status: Joi.number().integer().valid(0, 1).optional().messages({
        'number.base': 'Status must be a number',
        'any.only': 'Status must be 0 or 1'
    })
});
