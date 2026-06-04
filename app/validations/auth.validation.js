import Joi from 'joi';

export const requestOTPSchema = Joi.object({
    phone: Joi.string()
        .min(10)
        .required()
        .messages({
            'string.empty': 'Phone number is required',
            'any.required': 'Phone number is required',
            'string.min': 'Phone number must be at least 10 digits long'
        })
});

export const verifyOTPSchema = Joi.object({
    phone: Joi.string()
        .min(10)
        .required()
        .messages({
            'string.empty': 'Phone number is required',
            'any.required': 'Phone number is required',
            'string.min': 'Phone number must be at least 10 digits long'
        }),
    otp: Joi.string()
        .length(6)
        .required()
        .messages({
            'string.empty': 'OTP is required',
            'any.required': 'OTP is required',
            'string.length': 'OTP must be exactly 6 digits'
        }),
    platform: Joi.string().valid('w', 'a', 'i').optional(),
    device_token: Joi.string().optional()
});

export const adminRegisterSchema = Joi.object({
    name: Joi.string().max(20).optional(),
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
    role: Joi.number().valid(1, 2).optional()
});

export const adminLoginSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.empty': 'Email is required',
        'any.required': 'Email is required',
        'string.email': 'Please enter a valid email address'
    }),
    password: Joi.string().required().messages({
        'string.empty': 'Password is required',
        'any.required': 'Password is required'
    })
});
