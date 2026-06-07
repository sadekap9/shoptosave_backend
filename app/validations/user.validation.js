import Joi from 'joi';

export const updateProfileSchema = Joi.object({
    name: Joi.string().max(100).allow(null, '').optional(),
    email: Joi.string().email().max(100).allow(null, '').optional(),
    dob: Joi.string().max(20).allow(null, '').optional(),
    profile_image: Joi.string().max(300).allow(null, '').optional(),
    phone: Joi.string().max(15).min(10).allow(null, '').optional(),
    password: Joi.string().min(6).max(255).optional()
});

export const updateUserStatusSchema = Joi.object({
    is_active: Joi.alternatives().try(
        Joi.number().valid(0, 1),
        Joi.boolean(),
        Joi.string().valid('0', '1', 'true', 'false')
    ).required().messages({
        'any.required': 'is_active status is required',
        'any.only': 'is_active must be 0, 1, true, or false'
    })
});
