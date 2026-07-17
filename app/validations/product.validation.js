import Joi from 'joi';

export const productSchema = Joi.object({
    name: Joi.string().required(),
    sku: Joi.string().required(),
    price: Joi.number().required(),
    qty: Joi.number().integer().optional()
});

export const getProductsByCategoryParamsSchema = Joi.object({
    categoryId: Joi.number().integer().positive().required().messages({
        'number.base': 'Category ID must be numeric',
        'number.integer': 'Category ID must be an integer',
        'number.positive': 'Category ID must be a positive number',
        'any.required': 'Category ID is required'
    })
});

export const getProductBySkuParamsSchema = Joi.object({
    sku: Joi.string().trim().required().messages({
        'string.empty': 'SKU cannot be empty',
        'any.required': 'SKU is required'
    })
});

