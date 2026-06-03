import * as authService from '../../services/auth/auth.service.js';
import logger from '../../utils/logger.js';

/**
 * Request OTP for Login/Register
 */
export const requestOTP = async (req, res) => {
    try {
        const response = await authService.requestOTPService(req.validatedData);

        if (!response.success) {
            return res.status(response.statusCode).json({ 
                success: false, 
                errors: [{ message: response.message }], 
                result: {} 
            });
        }

        return res.status(response.statusCode).json({ 
            success: true, 
            errors: [], 
            result: { message: response.message, data: response.data } 
        });

    } catch (error) {
        logger.error("RequestOTP Error", { error: error.message, stack: error.stack });
        return res.status(500).json({ 
            success: false, 
            errors: [{ message: "Internal server error" }], 
            result: {} 
        });
    }
};

/**
 * Verify OTP (Handles both Login and Registration)
 */
export const verifyOTP = async (req, res) => {
    try {
        const payload = req.validatedData;
        const meta = {
            ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1',
            device_token: req.headers['devicetoken'] || null,
            platform: req.headers['platform'] || null
        };
        
        const response = await authService.verifyOTPService(payload, meta);

        if (!response.success) {
            return res.status(response.statusCode).json({ 
                success: false, 
                errors: [{ message: response.message }], 
                result: {} 
            });
        }

        return res.status(response.statusCode).json({ 
            success: true, 
            errors: [], 
            result: { 
                message: response.message, 
                data: response.data 
            } 
        });

    } catch (error) {
        logger.error("VerifyOTP Error", { error: error.message, stack: error.stack });
        return res.status(500).json({ 
            success: false, 
            errors: [{ message: "Internal server error" }], 
            result: {} 
        });
    }
};

/**
 * Resend OTP
 */
export const resendOTP = async (req, res) => {
    try {
        const response = await authService.resendOTPService(req.validatedData);

        if (!response.success) {
            return res.status(response.statusCode).json({ 
                success: false, 
                errors: [{ message: response.message }], 
                result: {} 
            });
        }

        return res.status(response.statusCode).json({ 
            success: true, 
            errors: [], 
            result: { message: response.message, data: response.data } 
        });

    } catch (error) {
        logger.error("ResendOTP Error", { error: error.message, stack: error.stack });
        return res.status(500).json({ 
            success: false, 
            errors: [{ message: "Internal server error" }], 
            result: {} 
        });
    }
};
