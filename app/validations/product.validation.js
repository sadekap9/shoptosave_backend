import Joi from 'joi';

export const productSchema = Joi.object({
    name: Joi.string().required(),
    sku: Joi.string().required(),
    price: Joi.number().required(),
    qty: Joi.number().integer().optional()
});
