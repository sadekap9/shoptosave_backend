export const validate = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
        abortEarly: true,
        errors: { label: 'key', wrap: { label: false } }
    });
    if (error) {
        return res.status(400).json({
            success: false,
            errors: error.details.map(detail => ({ message: detail.message })),
            result: {}
        });
    }
    req.validatedData = value;
    next();
};

export const validateQuery = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
        abortEarly: true,
        errors: { label: 'key', wrap: { label: false } }
    });
    if (error) {
        return res.status(400).json({
            success: false,
            errors: error.details.map(detail => ({ message: detail.message })),
            result: {}
        });
    }
    req.validatedData = value;
    next();
};

export const validateParams = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
        abortEarly: true,
        errors: { label: 'key', wrap: { label: false } }
    });
    if (error) {
        return res.status(400).json({
            success: false,
            errors: error.details.map(detail => ({ message: detail.message })),
            result: {}
        });
    }
    req.params = value;
    next();
};

