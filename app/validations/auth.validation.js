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
