import Joi from 'joi';

export const createSubAdminSchema = Joi.object({
    name: Joi.string().max(20).required().messages({
        'string.empty': 'Name is required',
        'any.required': 'Name is required',
        'string.max': 'Name must be at most 20 characters long'
    }),
    email: Joi.string().email().max(50).required().messages({
        'string.empty': 'Email is required',
        'any.required': 'Email is required',
        'string.email': 'Please enter a valid email address',
        'string.max': 'Email must be at most 50 characters long'
    }),
    password: Joi.string().min(6).max(255).required().messages({
        'string.empty': 'Password is required',
        'any.required': 'Password is required',
        'string.min': 'Password must be at least 6 characters long',
        'string.max': 'Password must be at most 255 characters long'
    }),
    phone: Joi.string().max(15).min(10).optional(),
    menu_access: Joi.array().items(Joi.string()).optional()
});

export const updateSubAdminSchema = Joi.object({
    name: Joi.string().max(20).optional(),
    email: Joi.string().email().max(50).optional(),
    password: Joi.string().min(6).max(255).optional(),
    phone: Joi.string().max(15).min(10).optional(),
    is_active: Joi.number().valid(0, 1).optional(),
    menu_access: Joi.array().items(Joi.string()).optional()
});
