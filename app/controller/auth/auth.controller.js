import * as authService from '../../services/auth/auth.service.js';
import logger from '../../utils/logger.js';

/**
 * Logout
 */
export const logOut = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(" ")[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                errors: [{ message: "Authentication required" }], 
                result: {} 
            });
        }

        const global = req.body?.global === true || req.query?.global === 'true';
        const userId = req.user?.id || null;

        const response = await authService.logoutService(token, global, userId);

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
            result: { message: response.message } 
        });

    } catch (error) {
        logger.error("LogOut Error", { error: error.message, stack: error.stack });
        return res.status(500).json({ 
            success: false, 
            errors: [{ message: "Internal server error" }], 
            result: {} 
        });
    }
};

/**
 * Refresh Access Token
 */
export const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.headers['refreshtoken'];

        if (!refreshToken) {
            return res.status(400).json({ 
                success: false, 
                errors: [{ message: "Refresh token is required" }], 
                result: {} 
            });
        }

        const response = await authService.refreshTokenService(refreshToken);

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
        logger.error("RefreshToken Error", { error: error.message, stack: error.stack });
        return res.status(500).json({ 
            success: false, 
            errors: [{ message: "Internal server error" }], 
            result: {} 
        });
    }
};

/**
 * Admin / Sub-Admin Registration
 */
export const adminRegister = async (req, res) => {
    try {
        const payload = req.validatedData;
        const meta = {
            ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1',
            device_token: req.headers['devicetoken'] || req.query.device_token || payload.device_token || null,
            platform: req.headers['platform'] || req.query.platform || payload.platform || 'w',
            device_name: req.headers['devicename'] || req.query.device_name || payload.device_name || null
        };

        const response = await authService.adminRegisterService(payload, meta);

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
        logger.error("AdminRegister Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};

/**
 * Admin / Sub-Admin Login
 */
export const adminLogin = async (req, res) => {
    try {
        const payload = req.validatedData;
        const meta = {
            ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1',
            device_token: req.headers['devicetoken'] || req.query.device_token || payload.device_token || null,
            platform: req.headers['platform'] || req.query.platform || payload.platform || 'w',
            device_name: req.headers['devicename'] || req.query.device_name || payload.device_name || null
        };

        const response = await authService.adminLoginService(payload, meta);

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
        logger.error("AdminLogin Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};

/**
 * Create PIN for New Registrations
 */
export const createPin = async (req, res) => {
    try {
        const payload = req.validatedData;
        const meta = {
            ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1',
            device_token: req.headers['devicetoken'] || req.query.device_token || payload.device_token || null,
            platform: req.headers['platform'] || req.query.platform || payload.platform || 'w',
            device_name: req.headers['devicename'] || req.query.device_name || payload.device_name || null
        };

        const response = await authService.createPinService(payload, meta);

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
        logger.error("createPin Controller Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};

/**
 * Login PIN for Existing Users
 */
export const loginPin = async (req, res) => {
    try {
        const payload = req.validatedData;
        const meta = {
            ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1',
            device_token: req.headers['devicetoken'] || req.query.device_token || payload.device_token || null,
            platform: req.headers['platform'] || req.query.platform || payload.platform || 'w',
            device_name: req.headers['devicename'] || req.query.device_name || payload.device_name || null
        };

        const response = await authService.loginPinService(payload, meta);

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
        logger.error("loginPin Controller Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};

/**
 * Forgot PIN Controller
 */
export const forgotPin = async (req, res) => {
    try {
        const response = await authService.forgotPinService(req.validatedData);

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
        logger.error("forgotPin Controller Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};

/**
 * Verify Forgot PIN OTP Controller
 */
export const verifyForgotPinOTP = async (req, res) => {
    try {
        const response = await authService.verifyForgotPinOTPService(req.validatedData);

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
        logger.error("verifyForgotPinOTP Controller Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};

/**
 * Reset PIN Controller
 */
export const resetPin = async (req, res) => {
    try {
        const payload = req.validatedData;
        const meta = {
            ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1',
            device_token: req.headers['devicetoken'] || req.query.device_token || payload.device_token || null,
            platform: req.headers['platform'] || req.query.platform || payload.platform || 'w',
            device_name: req.headers['devicename'] || req.query.device_name || payload.device_name || null
        };

        const response = await authService.resetPinService(payload, meta);

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
        logger.error("resetPin Controller Error", { error: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            errors: [{ message: "Internal server error" }],
            result: {}
        });
    }
};
