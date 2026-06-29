import Joi from 'joi';

export const generateTokenSchema = Joi.object({
    authorizationCode: Joi.string().required()
});

export const checkBalanceSchema = Joi.object({
    cardNumber: Joi.string().required()
});

export const resendCardsSchema = Joi.object({
    cards: Joi.array().items(
        Joi.object({
            id: Joi.number().required(),
            name: Joi.string().required(),
            telephone: Joi.string().required(),
            email: Joi.string().email().required()
        })
    ).min(1).required()
});

export const placeOrderSchema = Joi.object({
    address: Joi.object({
        firstname: Joi.string().required(),
        lastname: Joi.string().required(),
        email: Joi.string().email().required(),
        telephone: Joi.string().required(),
        line1: Joi.string().required(),
        line2: Joi.string().optional().allow(''),
        city: Joi.string().required(),
        region: Joi.string().required(),
        country: Joi.string().required(),
        postcode: Joi.string().required(),
        billToThis: Joi.boolean().optional()
    }).required(),
    payments: Joi.array().items(
        Joi.object({
            code: Joi.string().required(),
            amount: Joi.number().required()
        })
    ).min(1).required(),
    refno: Joi.string().required(),
    syncOnly: Joi.boolean().optional(),
    deliveryMode: Joi.string().optional(),
    products: Joi.array().items(
        Joi.object({
            sku: Joi.string().required(),
            price: Joi.number().required(),
            qty: Joi.number().integer().min(1).required(),
            currency: Joi.number().optional()
        })
    ).min(1).required()
});
