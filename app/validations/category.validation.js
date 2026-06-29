import Joi from 'joi';

export const categorySchema = Joi.object({
    name: Joi.string().required(),
    woohoo_category_id: Joi.alternatives().try(Joi.number(), Joi.string()).required()
});
