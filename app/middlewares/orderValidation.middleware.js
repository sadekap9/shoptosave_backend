import logger from '../utils/logger.js';

export const validateOrderQuantityAndSync = (req, res, next) => {
    try {
        const body = req.body || {};

        // 1. Extract sync status
        const isSyncOnly = body.sync_only === true || 
                           body.sync_only === 'true' || 
                           body.syncOnly === true || 
                           body.syncOnly === 'true';

        // 2. Extract and calculate quantity
        let maxQty = 0;
        let sumQty = 0;

        // Check root level qty/quantity
        const rootQty = parseInt(body.qty, 10) || parseInt(body.quantity, 10) || 0;
        if (rootQty > 0) {
            maxQty = rootQty;
            sumQty = rootQty;
        }

        // Check products array
        if (Array.isArray(body.products)) {
            let productsSum = 0;
            for (const product of body.products) {
                if (product) {
                    const pQty = parseInt(product.qty, 10) || parseInt(product.quantity, 10) || 0;
                    if (pQty > maxQty) {
                        maxQty = pQty;
                    }
                    productsSum += pQty;
                }
            }
            if (productsSum > 0) {
                sumQty = productsSum;
            }
        }

        const effectiveQuantity = Math.max(maxQty, sumQty);

        // 3. Apply business rule: quantity > 5 AND sync_only = true -> Reject
        if (effectiveQuantity > 5 && isSyncOnly) {
            logger.warn(`Order rejected: Quantity (${effectiveQuantity}) is greater than 5 with sync_only/syncOnly enabled.`);
            return res.status(400).json({
                code: 5321,
                message: "Order cannot be processed",
                errors: [],
                result: {
                    additionalTxnFields: {}
                }
            });
        }

        next();
    } catch (error) {
        logger.error('Error in validateOrderQuantityAndSync middleware', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal Server Error' }],
            result: {}
        });
    }
};
