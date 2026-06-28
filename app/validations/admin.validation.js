import Joi from 'joi';

export const listTopupsSchema = Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
    status: Joi.number().integer().valid(1, 2, 3).optional(), // 1=Pending, 2=Approved, 3=Rejected
    request_no: Joi.string().max(100).optional(),
    user: Joi.string().max(100).optional() // search by user name/phone/email
});

export const listOrdersSchema = Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
    status: Joi.number().integer().valid(0, 1, 2, 3, 4).optional(), // ORDER_STATUS values
    woohoo_reference_no: Joi.string().max(100).optional(),
    order_id: Joi.number().integer().optional(),
    user: Joi.string().max(100).optional()
});

export const manualRefundSchema = Joi.object({
    orderId: Joi.number().integer().required().messages({
        'any.required': 'orderId is required',
        'number.base': 'orderId must be a valid integer'
    }),
    remarks: Joi.string().max(255).required().messages({
        'any.required': 'Remarks are required for audits'
    })
});
